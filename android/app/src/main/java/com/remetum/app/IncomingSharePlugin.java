package com.remetum.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "IncomingShare")
public class IncomingSharePlugin extends Plugin {
  private static final int MAX_BYTES = 25 * 1024 * 1024;
  private static final int CHUNK_BYTES = 256 * 1024;
  private static final String HANDLED_EXTRA = "remetum.share.handled";

  private static IncomingSharePlugin instance;
  private static Intent queuedIntent;

  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final AtomicBoolean reading = new AtomicBoolean(false);

  private String pendingText;
  private byte[] pendingBytes;
  private String pendingFilename;
  private String pendingMime;
  private String pendingError;
  private int offerId;
  private boolean claimed;

  public static void handleIncomingIntent(Intent intent) {
    if (instance != null) {
      instance.ingest(intent);
    } else {
      queuedIntent = intent;
    }
  }

  @Override
  public void load() {
    instance = this;
    Intent queued = queuedIntent;
    queuedIntent = null;
    if (queued != null) {
      ingest(queued);
    } else if (getActivity() != null) {
      ingest(getActivity().getIntent());
    }
  }

  @Override
  public void handleOnDestroy() {
    instance = null;
    pendingBytes = null;
    io.shutdownNow();
    super.handleOnDestroy();
  }

  private void ingest(Intent intent) {
    if (intent == null) return;
    String action = intent.getAction();
    if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
      return;
    }
    if (intent.getBooleanExtra(HANDLED_EXTRA, false)) return;
    intent.putExtra(HANDLED_EXTRA, true);

    if (reading.getAndSet(true)) return;

    io.execute(
      () -> {
        try {
          parseIntent(intent);
        } catch (Exception e) {
          pendingError = e.getMessage() != null ? e.getMessage() : "Falha ao receber arquivo";
          pendingText = null;
          pendingBytes = null;
        } finally {
          reading.set(false);
          android.app.Activity activity = getActivity();
          if (activity == null) return;
          activity.runOnUiThread(
            () -> {
              notifyIfReady();
              openAppRoute();
            }
          );
        }
      }
    );
  }

  private void parseIntent(Intent intent) throws Exception {
    pendingError = null;
    pendingText = null;
    pendingBytes = null;
    claimed = false;

    Uri uri = firstStreamUri(intent);
    if (uri != null) {
      readUri(uri, intent.getType());
      return;
    }

    String text = intent.getStringExtra(Intent.EXTRA_TEXT);
    String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
    if (text != null && !text.trim().isEmpty()) {
      if (subject != null && !subject.trim().isEmpty() && !text.contains(subject)) {
        pendingText = subject.trim() + "\n" + text.trim();
      } else {
        pendingText = text.trim();
      }
      offerId += 1;
      return;
    }

    pendingError = "Nada para compartilhar";
  }

  private Uri firstStreamUri(Intent intent) {
    if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
      ArrayList<Uri> uris;
      if (Build.VERSION.SDK_INT >= 33) {
        uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
      } else {
        uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
      }
      if (uris != null && !uris.isEmpty()) return uris.get(0);
      return null;
    }
    if (Build.VERSION.SDK_INT >= 33) {
      return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
    }
    return intent.getParcelableExtra(Intent.EXTRA_STREAM);
  }

  private void readUri(Uri uri, String fallbackMime) throws Exception {
    ContentResolver resolver = getContext().getContentResolver();
    String mime = resolver.getType(uri);
    if (mime == null || mime.isEmpty()) mime = fallbackMime;
    if (mime == null) mime = "application/octet-stream";

    String filename = queryDisplayName(resolver, uri);
    if (filename == null || filename.isEmpty()) filename = "arquivo";

    try (InputStream in = resolver.openInputStream(uri)) {
      if (in == null) throw new Exception("Não foi possível abrir o arquivo");
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buf = new byte[16 * 1024];
      int n;
      int total = 0;
      while ((n = in.read(buf)) != -1) {
        total += n;
        if (total > MAX_BYTES) {
          throw new Exception("Arquivo maior que 25 MB");
        }
        out.write(buf, 0, n);
      }
      pendingBytes = out.toByteArray();
      pendingFilename = filename;
      pendingMime = mime;
      offerId += 1;
    }
  }

  private String queryDisplayName(ContentResolver resolver, Uri uri) {
    try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (index >= 0) return cursor.getString(index);
      }
    } catch (Exception ignored) {
      // fallback below
    }
    String last = uri.getLastPathSegment();
    return last != null ? last : "arquivo";
  }

  private JSObject snapshot() {
    JSObject obj = new JSObject();
    if (pendingError != null) {
      obj.put("kind", "error");
      obj.put("message", pendingError);
      obj.put("id", offerId);
      return obj;
    }
    if (pendingText != null) {
      obj.put("kind", "text");
      obj.put("text", pendingText);
      obj.put("id", offerId);
      return obj;
    }
    if (pendingBytes != null) {
      obj.put("kind", "file");
      obj.put("filename", pendingFilename);
      obj.put("mimeType", pendingMime);
      obj.put("size", pendingBytes.length);
      obj.put("id", offerId);
      return obj;
    }
    obj.put("kind", "none");
    return obj;
  }

  private void notifyIfReady() {
    JSObject ping = new JSObject();
    ping.put("kind", "ready");
    ping.put("id", offerId);
    notifyListeners("shareReceived", ping);
  }

  private void openAppRoute() {
    Bridge bridge = getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    webView.post(
      () -> {
        String current = webView.getUrl();
        if (current != null && current.contains("/app")) return;
        String server = "https://remetum.com";
        try {
          String configured = bridge.getServerUrl();
          if (configured != null && !configured.isEmpty()) {
            server = configured.replaceAll("/$", "");
          }
        } catch (Exception ignored) {
          // use default
        }
        webView.loadUrl(server + "/app");
      }
    );
  }

  @PluginMethod
  public void getPending(PluginCall call) {
    if (reading.get()) {
      JSObject busy = new JSObject();
      busy.put("kind", "busy");
      call.resolve(busy);
      return;
    }
    if (claimed) {
      JSObject none = new JSObject();
      none.put("kind", "none");
      call.resolve(none);
      return;
    }
    JSObject payload = snapshot();
    String kind = payload.optString("kind", "none");
    if ("none".equals(kind)) {
      call.resolve(payload);
      return;
    }
    claimed = true;
    if ("text".equals(kind) || "error".equals(kind)) {
      pendingText = null;
      pendingError = null;
    }
    call.resolve(payload);
  }

  @PluginMethod
  public void readChunk(PluginCall call) {
    Integer offsetValue = call.getInt("offset");
    int offset = offsetValue != null ? offsetValue : 0;
    if (pendingBytes == null) {
      call.reject("Nada para ler");
      return;
    }
    if (offset < 0 || offset > pendingBytes.length) {
      call.reject("Offset inválido");
      return;
    }
    int end = Math.min(pendingBytes.length, offset + CHUNK_BYTES);
    byte[] slice = Arrays.copyOfRange(pendingBytes, offset, end);
    JSObject obj = new JSObject();
    obj.put("data", Base64.encodeToString(slice, Base64.NO_WRAP));
    obj.put("next", end);
    obj.put("done", end >= pendingBytes.length);
    if (end >= pendingBytes.length) {
      pendingBytes = null;
      pendingFilename = null;
      pendingMime = null;
    }
    call.resolve(obj);
  }

  @PluginMethod
  public void discard(PluginCall call) {
    pendingText = null;
    pendingBytes = null;
    pendingFilename = null;
    pendingMime = null;
    pendingError = null;
    claimed = false;
    call.resolve();
  }
}
