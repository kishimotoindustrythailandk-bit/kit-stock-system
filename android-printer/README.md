# Control Stock KIT Printer

Android bridge for printing 100 x 55 mm KIT tags to a paired Rongta RPP04 over Bluetooth Classic SPP.

## First use

1. Install the APK on the Samsung A07.
2. Open Android Bluetooth settings and pair `RPP04-E`.
3. Open Control Stock KIT in Chrome.
4. Tap `RPP04 ตรง`; Android opens this app with the rendered ESC/POS tag.
5. Review the tag count and tap confirm to print.

The app accepts only `controlstockkit://print` links and rejects payloads larger than 950 KB.
