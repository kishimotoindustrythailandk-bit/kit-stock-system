package th.co.kishimoto.controlstockprinter;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

public class MainActivity extends Activity {
    private static final int REQUEST_BLUETOOTH = 1001;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String WEB_URL = "https://kit-stock-system.kishimoto-th.workers.dev/?page=tags";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TextView status;
    private TextView detail;
    private Button printButton;
    private ProgressBar progress;
    private String encodedData;
    private String encoding;
    private int tagCount;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildScreen();
        readPrintIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readPrintIntent(intent);
    }

    private void buildScreen() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24), dp(34), dp(24), dp(24));
        root.setBackgroundColor(Color.rgb(244, 248, 255));

        TextView brand = text("KiT", 34, Color.rgb(24, 79, 181), true);
        root.addView(brand);
        root.addView(text("CONTROL STOCK KIT PRINTER", 15, Color.rgb(34, 49, 79), true));

        status = text("พร้อมรับข้อมูล Tag", 24, Color.rgb(17, 40, 82), true);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
        statusParams.setMargins(0, dp(42), 0, dp(10));
        root.addView(status, statusParams);

        detail = text("เปิดการพิมพ์จากหน้า Control Stock KIT", 16, Color.DKGRAY, false);
        detail.setLineSpacing(0, 1.2f);
        root.addView(detail);

        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(dp(48), dp(48));
        progressParams.gravity = Gravity.CENTER_HORIZONTAL;
        progressParams.setMargins(0, dp(28), 0, dp(12));
        root.addView(progress, progressParams);

        printButton = button("พิมพ์ RT4-E", Color.rgb(34, 95, 210));
        printButton.setEnabled(false);
        printButton.setOnClickListener(v -> requestPermissionAndPrint());
        root.addView(printButton, buttonParams());

        Button settingsButton = button("ตั้งค่า / จับคู่ Bluetooth", Color.rgb(73, 91, 124));
        settingsButton.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)));
        root.addView(settingsButton, buttonParams());

        Button webButton = button("กลับไป Control Stock KIT", Color.rgb(20, 130, 82));
        webButton.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(WEB_URL))));
        root.addView(webButton, buttonParams());

        TextView help = text("ก่อนใช้งานครั้งแรก ให้จับคู่เครื่องชื่อ RT4-E ในการตั้งค่า Bluetooth ของมือถือ", 14, Color.rgb(105, 67, 15), false);
        LinearLayout.LayoutParams helpParams = new LinearLayout.LayoutParams(-1, -2);
        helpParams.setMargins(0, dp(28), 0, 0);
        root.addView(help, helpParams);
        setContentView(root);
    }

    private void readPrintIntent(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"controlstockkit".equals(data.getScheme()) || !"print".equals(data.getHost())) {
            encodedData = null;
            printButton.setEnabled(false);
            status.setText("พร้อมรับข้อมูล Tag");
            detail.setText("เปิดการพิมพ์จากหน้า Control Stock KIT");
            return;
        }
        encodedData = data.getQueryParameter("data");
        encoding = data.getQueryParameter("encoding");
        try {
            tagCount = Math.max(1, Integer.parseInt(data.getQueryParameter("count")));
        } catch (Exception ignored) {
            tagCount = 1;
        }
        boolean valid = encodedData != null && !encodedData.isEmpty() && encodedData.length() < 950000;
        printButton.setEnabled(valid);
        printButton.setText("ยืนยันพิมพ์ " + tagCount + " Tag");
        status.setText(valid ? "ได้รับข้อมูลจาก Control Stock KIT" : "ข้อมูล Tag ไม่ถูกต้อง");
        detail.setText(valid
                ? "ตรวจสอบว่าเปิดเครื่องและจับคู่ RT4-E แล้ว จากนั้นกดยืนยันพิมพ์"
                : "กลับไปหน้าเว็บแล้วกดพิมพ์ RT4-E ใหม่อีกครั้ง");
    }

    private void requestPermissionAndPrint() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQUEST_BLUETOOTH);
            return;
        }
        printNow();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_BLUETOOTH && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            printNow();
        } else if (requestCode == REQUEST_BLUETOOTH) {
            showError("ต้องอนุญาตอุปกรณ์ใกล้เคียงเพื่อเชื่อมต่อเครื่องพิมพ์");
        }
    }

    private void printNow() {
        setBusy(true, "กำลังเชื่อมต่อ RT4-E…");
        executor.execute(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) throw new Exception("กรุณาเปิด Bluetooth");
                BluetoothDevice printer = findPairedPrinter(adapter.getBondedDevices());
                if (printer == null) throw new Exception("ไม่พบ RT4-E ที่จับคู่ไว้ กรุณากดตั้งค่า / จับคู่ Bluetooth ก่อน");
                adapter.cancelDiscovery();
                socket = printer.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
                byte[] bytes = decodePayload(encodedData, encoding);
                OutputStream output = socket.getOutputStream();
                for (int offset = 0; offset < bytes.length; offset += 1024) {
                    int length = Math.min(1024, bytes.length - offset);
                    output.write(bytes, offset, length);
                }
                output.flush();
                Thread.sleep(900L);
                runOnUiThread(() -> {
                    setBusy(false, "พิมพ์สำเร็จ " + tagCount + " Tag");
                    detail.setText("ส่งข้อมูลไปยัง RT4-E เรียบร้อยแล้ว");
                    printButton.setEnabled(false);
                });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "เชื่อมต่อเครื่องพิมพ์ไม่สำเร็จ" : error.getMessage();
                runOnUiThread(() -> showError(message));
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) { }
                }
            }
        });
    }

    private BluetoothDevice findPairedPrinter(Set<BluetoothDevice> devices) {
        BluetoothDevice fallback = null;
        for (BluetoothDevice device : devices) {
            String name = device.getName();
            if (name == null) continue;
            String upper = name.toUpperCase();
            if (upper.contains("RT4-E")) return device;
            if (upper.contains("RPP04-E")) return device;
            if (upper.contains("RT4") || upper.contains("RPP04")) fallback = device;
        }
        return fallback;
    }

    private byte[] decodePayload(String value, String mode) throws Exception {
        String padded = value.replace('-', '+').replace('_', '/');
        while (padded.length() % 4 != 0) padded += "=";
        byte[] packed = Base64.decode(padded, Base64.DEFAULT);
        if (!"gzip".equals(mode)) return packed;
        GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(packed));
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = gzip.read(buffer)) != -1) output.write(buffer, 0, read);
        gzip.close();
        return output.toByteArray();
    }

    private void setBusy(boolean busy, String message) {
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        printButton.setEnabled(!busy && encodedData != null);
        status.setText(message);
    }

    private void showError(String message) {
        setBusy(false, "พิมพ์ไม่สำเร็จ");
        detail.setText(message);
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        if (bold) view.setTypeface(null, android.graphics.Typeface.BOLD);
        return view;
    }

    private Button button(String value, int color) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextSize(16);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(color);
        return button;
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(56));
        params.setMargins(0, dp(12), 0, 0);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }
}
