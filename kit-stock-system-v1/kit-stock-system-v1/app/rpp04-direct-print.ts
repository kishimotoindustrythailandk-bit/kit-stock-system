"use client";

const DOTS_WIDE = 800;
const DOTS_HIGH = 440;
const RPP04_SERVICE = 0xffe0;
const RPP04_WRITE_CHARACTERISTIC = 0xffe1;
const SERVICE_UUIDS = [
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ffe5-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
] as const;

type BluetoothCharacteristic = {
  properties?: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
};

type BluetoothService = {
  uuid?: string;
  getCharacteristics: () => Promise<BluetoothCharacteristic[]>;
  getCharacteristic?: (characteristic: string | number) => Promise<BluetoothCharacteristic>;
};

type BluetoothServer = {
  connected?: boolean;
  getPrimaryService: (service: string | number) => Promise<BluetoothService>;
  getPrimaryServices?: () => Promise<BluetoothService[]>;
};

type BluetoothDevice = {
  name?: string;
  gatt?: BluetoothServer & { connect: () => Promise<BluetoothServer> };
};

export type Rpp04Session = {
  deviceName: string;
  characteristic: BluetoothCharacteristic;
};

export type Rpp04Tag = {
  customer: string;
  materialCode: string;
  partName: string;
  deliveryQty: number;
  qty: number;
  boxNo: number;
  boxCount: number;
  isFullBox: boolean;
  jobNo: string;
  issueDate: string;
  location: string;
  tagId: string;
  payload: string;
  qrDataUrl: string;
  imageDataUrl?: string;
};

let activeSession: Rpp04Session | null = null;
let pendingSession: Promise<Rpp04Session> | null = null;

function printerError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotFoundError") return new Error("ยังไม่ได้เลือกเครื่องพิมพ์ กรุณากด RPP04 แล้วเลือก RPP04-B");
  if (name === "SecurityError") return new Error("Chrome ไม่อนุญาต Bluetooth กรุณาเปิด Bluetooth และ Location แล้วลองใหม่");
  if (error instanceof Error && error.message.includes("GATT operation already in progress")) {
    return new Error("เครื่องพิมพ์กำลังเชื่อมต่ออยู่ กรุณารอ 2 วินาทีแล้วกด RPP04 ตรงอีกครั้ง");
  }
  return error instanceof Error ? error : new Error("เชื่อมต่อ RPP04 ไม่สำเร็จ");
}

export async function prepareRpp04Bluetooth(): Promise<Rpp04Session> {
  if (activeSession) return activeSession;
  if (pendingSession) return pendingSession;
  const bluetooth = (navigator as Navigator & {
    bluetooth?: {
      requestDevice: (options: unknown) => Promise<BluetoothDevice>;
    };
  }).bluetooth;
  if (!bluetooth) {
    throw new Error("มือถือรุ่นนี้ยังไม่เปิด Web Bluetooth กรุณาใช้ Google Chrome และเปิด Bluetooth กับ Location");
  }
  pendingSession = (async () => {
    const device = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [RPP04_SERVICE, 0x18f0, ...SERVICE_UUIDS],
    });
    if (!device.gatt) throw new Error("เครื่องพิมพ์นี้ไม่มีช่องเชื่อมต่อ Bluetooth GATT");
    let server: BluetoothServer;
    try {
      server = await device.gatt.connect();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("GATT operation already in progress")) throw error;
      await wait(700);
      server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    }
    // RPP04-B exposes its ESC/POS data channel here. Resolve it directly first;
    // some Android/Chrome versions do not reliably report characteristic
    // properties while enumerating every characteristic in a service.
    let directChannelError = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (!device.gatt.connected) server = await device.gatt.connect();
        const rpp04Service = await server.getPrimaryService(RPP04_SERVICE);
        const rpp04Characteristic = rpp04Service.getCharacteristic
          ? await rpp04Service.getCharacteristic(RPP04_WRITE_CHARACTERISTIC)
          : (await rpp04Service.getCharacteristics())[0];
        if (rpp04Characteristic) {
          activeSession = { deviceName: device.name || "RPP04-B", characteristic: rpp04Characteristic };
          return activeSession;
        }
      } catch (error) {
        directChannelError = error instanceof Error ? error.message : String(error);
        if (attempt < 2) await wait(450 + attempt * 350);
      }
    }

    // A few Android builds resolve vendor UUIDs only after listing the granted
    // services. Use the UUIDs reported by the printer as a second direct path.
    if (!device.gatt.connected) {
      try {
        server = await device.gatt.connect();
      } catch (error) {
        directChannelError = error instanceof Error ? error.message : String(error);
      }
    }
    if (server.getPrimaryServices) {
      try {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          const characteristics = await service.getCharacteristics();
          const ffe1 = characteristics.find((item) => {
            const uuid = (item as BluetoothCharacteristic & { uuid?: string }).uuid?.toLowerCase() || "";
            return uuid === "0000ffe1-0000-1000-8000-00805f9b34fb" || uuid.endsWith("ffe1");
          });
          if (ffe1) {
            activeSession = { deviceName: device.name || "RPP04-B", characteristic: ffe1 };
            return activeSession;
          }
        }
      } catch (error) {
        if (!directChannelError) directChannelError = error instanceof Error ? error.message : String(error);
      }
    }

    for (const serviceUuid of SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const characteristics = await service.getCharacteristics();
        const writable = characteristics.find((item) =>
          Boolean(item.properties?.writeWithoutResponse || item.properties?.write)
          && Boolean(item.writeValueWithoutResponse || item.writeValue),
        );
        if (writable) {
          activeSession = { deviceName: device.name || "RPP04", characteristic: writable };
          return activeSession;
        }
      } catch {
        // The firmware exposes only one of the supported printer services.
      }
    }
    throw new Error(`เชื่อมต่อ RPP04-B ได้ แต่เปิดช่อง FFE1 ไม่สำเร็จ${directChannelError ? ` (${directChannelError})` : ""}`);
  })();
  try {
    return await pendingSession;
  } catch (error) {
    activeSession = null;
    throw printerError(error);
  } finally {
    pendingSession = null;
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function writeEsc(session: Rpp04Session, bytes: Uint8Array) {
  const characteristic = session.characteristic;
  const write = characteristic.properties?.writeWithoutResponse && characteristic.writeValueWithoutResponse
    ? characteristic.writeValueWithoutResponse.bind(characteristic)
    : characteristic.writeValue?.bind(characteristic);
  if (!write) throw new Error("เครื่องพิมพ์ไม่รองรับการรับคำสั่ง ESC");
  // RPP04-B uses the default BLE ATT payload (20 bytes) on this firmware.
  // Larger packets can connect successfully but fail as soon as printing starts.
  const chunkSize = 20;
  for (let offset = 0, index = 0; offset < bytes.length; offset += chunkSize, index += 1) {
    const chunk = bytes.slice(offset, Math.min(offset + chunkSize, bytes.length));
    await write(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
    if (index % 12 === 11) await wait(8);
  }
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const text = value || "—";
  if (context.measureText(text).width <= maxWidth) return text;
  let output = text;
  while (output.length > 1 && context.measureText(output + "…").width > maxWidth) output = output.slice(0, -1);
  return output + "…";
}

function label(context: CanvasRenderingContext2D, title: string, value: string, x: number, y: number, width: number, valueSize = 22) {
  context.fillStyle = "#000";
  context.font = '700 13px Arial, "Noto Sans Thai", sans-serif';
  context.fillText(title, x, y);
  context.font = `900 ${valueSize}px Arial, "Noto Sans Thai", sans-serif`;
  context.fillText(fitText(context, value, width), x, y + valueSize + 4);
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("โหลดรูปสำหรับพิมพ์ไม่สำเร็จ"));
    image.src = source;
  });
}

async function renderTag(tag: Rpp04Tag) {
  const canvas = document.createElement("canvas");
  canvas.width = DOTS_WIDE;
  canvas.height = DOTS_HIGH;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("มือถือไม่สามารถสร้างภาพ Tag ได้");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, DOTS_WIDE, DOTS_HIGH);
  context.strokeStyle = "#000";
  context.lineWidth = 3;
  // Keep the visible border and all important content above the printer's
  // final raster rows. Older RPP04/RT4 firmware can drop a few trailing rows
  // while changing from raster printing back to paper feed mode.
  context.strokeRect(2, 2, DOTS_WIDE - 4, 422);

  context.fillStyle = "#000";
  context.fillRect(3, 3, DOTS_WIDE - 6, 56);
  context.fillStyle = "#fff";
  context.font = "900 32px Arial, sans-serif";
  context.fillText("KiT", 16, 40);
  context.font = "900 20px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText("STOCK RECEIVING TAG", 782, 28);
  context.font = '800 16px Arial, "Noto Sans Thai", sans-serif';
  context.fillText("TAG รับงานเข้า STOCK", 782, 49);
  context.textAlign = "left";

  context.strokeRect(12, 70, 184, 142);
  if (tag.imageDataUrl) {
    try {
      const partImage = await loadImage(tag.imageDataUrl);
      context.drawImage(partImage, 16, 74, 176, 134);
    } catch {
      context.font = '700 18px Arial, "Noto Sans Thai", sans-serif';
      context.fillText("ไม่มีรูปชิ้นงาน", 38, 145);
    }
  } else {
    context.font = '700 18px Arial, "Noto Sans Thai", sans-serif';
    context.fillText("ไม่มีรูปชิ้นงาน", 38, 145);
  }
  const qrImage = await loadImage(tag.qrDataUrl);
  context.drawImage(qrImage, 210, 70, 142, 142);
  label(context, "CUSTOMER", tag.customer, 370, 82, 410, 24);
  label(context, "PART NO. / MATERIAL", tag.materialCode, 370, 130, 410, 31);
  label(context, "PART NAME", tag.partName, 370, 188, 410, 21);

  const gridTop = 226;
  const col = 262;
  const row = 67;
  context.lineWidth = 2;
  context.strokeRect(12, gridTop, 776, row * 2);
  context.beginPath();
  context.moveTo(12 + col, gridTop); context.lineTo(12 + col, gridTop + row * 2);
  context.moveTo(12 + col * 2, gridTop); context.lineTo(12 + col * 2, gridTop + row * 2);
  context.moveTo(12, gridTop + row); context.lineTo(788, gridTop + row);
  context.stroke();
  label(context, "DELIVERY QTY / จำนวนรวม", String(tag.deliveryQty), 22, gridTop + 19, 235, 30);
  label(context, "QTY IN BOX / จำนวนในกล่อง", String(tag.qty), 284, gridTop + 19, 235, 30);
  label(context, "BOX / กล่อง", `${tag.boxNo} / ${tag.boxCount}`, 546, gridTop + 19, 95, 27);
  context.font = '900 24px Arial, "Noto Sans Thai", sans-serif';
  context.fillText(tag.isFullBox ? "TAG เต็ม" : "TAG เศษ", 650, gridTop + 49);
  label(context, "JOB NO.", tag.jobNo, 22, gridTop + row + 19, 235, 21);
  label(context, "TAG ISSUE DATE / วันที่ออก TAG", tag.issueDate, 284, gridTop + row + 19, 235, 21);
  label(context, "LOCATION / ตำแหน่ง", tag.location, 546, gridTop + row + 19, 225, 24);

  context.fillStyle = "#000";
  context.font = "900 18px Arial, sans-serif";
  context.fillText(fitText(context, tag.tagId, 520), 16, 382);
  context.font = "700 12px Arial, sans-serif";
  context.fillText(fitText(context, tag.payload, 760), 16, 414);
  context.font = '800 14px Arial, "Noto Sans Thai", sans-serif';
  context.textAlign = "right";
  context.fillText("ยิง QR เพื่อรับงานเข้า Stock", 782, 382);
  context.textAlign = "left";

  const pixels = context.getImageData(0, 0, DOTS_WIDE, DOTS_HIGH).data;
  const widthBytes = Math.ceil(DOTS_WIDE / 8);
  const raster = new Uint8Array(widthBytes * DOTS_HIGH);
  for (let y = 0; y < DOTS_HIGH; y += 1) {
    for (let x = 0; x < DOTS_WIDE; x += 1) {
      const source = (y * DOTS_WIDE + x) * 4;
      const luminance = pixels[source] * 0.299 + pixels[source + 1] * 0.587 + pixels[source + 2] * 0.114;
      if (pixels[source + 3] > 32 && luminance < 165) {
        raster[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return raster;
}

export function buildEscPosRaster(raster: Uint8Array, width = DOTS_WIDE, height = DOTS_HIGH) {
  const widthBytes = Math.ceil(width / 8);
  const header = new Uint8Array([
    0x1b, 0x40,
    0x1b, 0x61, 0x00,
    0x1d, 0x4c, 0x00, 0x00,
    0x1d, 0x76, 0x30, 0x00,
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ]);
  // Use a short controlled feed instead of form-feed. It gives the thermal
  // head enough time/paper travel to finish the bottom rows before the socket
  // is closed, without adding a large blank tail to the 55 mm label.
  const trailer = new Uint8Array([
    0x1b, 0x33, 0x0c,
    0x0a, 0x0a, 0x0a, 0x0a,
    0x1b, 0x32,
  ]);
  const output = new Uint8Array(header.length + raster.length + trailer.length);
  output.set(header, 0);
  output.set(raster, header.length);
  output.set(trailer, header.length + raster.length);
  return output;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  const block = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += block) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + block, bytes.length)));
  }
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function gzip(bytes: Uint8Array) {
  if (!("CompressionStream" in window)) return { bytes, encoding: "raw" } as const;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), encoding: "gzip" } as const;
}

export async function openRpp04AndroidBridge(tags: Rpp04Tag[]) {
  if (!/Android/i.test(navigator.userAgent)) {
    throw new Error("การพิมพ์ RPP04 ต้องเปิดจากมือถือ Android ที่ติดตั้ง Control Stock KIT Printer");
  }
  const documents: Uint8Array[] = [];
  let totalLength = 0;
  for (const tag of tags) {
    const command = buildEscPosRaster(await renderTag(tag));
    documents.push(command);
    totalLength += command.length;
  }
  const combined = new Uint8Array(totalLength);
  let cursor = 0;
  for (const document of documents) {
    combined.set(document, cursor);
    cursor += document.length;
  }
  const encoded = await gzip(combined);
  const data = toBase64Url(encoded.bytes);
  const fallback = encodeURIComponent(`${window.location.origin}/?page=tags&printer_app=missing`);
  const intent = `intent://print?data=${data}&encoding=${encoded.encoding}&count=${tags.length}#Intent;scheme=controlstockkit;package=th.co.kishimoto.controlstockprinter;S.browser_fallback_url=${fallback};end`;
  window.location.href = intent;
}

export async function printRpp04Tags(
  session: Rpp04Session,
  tags: Rpp04Tag[],
  onProgress?: (completed: number, total: number) => void,
) {
  try {
    for (let index = 0; index < tags.length; index += 1) {
      const raster = await renderTag(tags[index]);
      await writeEsc(session, buildEscPosRaster(raster));
      onProgress?.(index + 1, tags.length);
      if (index < tags.length - 1) await wait(120);
    }
  } catch (error) {
    activeSession = null;
    throw error;
  }
}
