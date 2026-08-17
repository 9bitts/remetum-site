package com.remetum.app;

import android.content.Intent;
import android.media.AudioManager;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(IncomingSharePlugin.class);
    super.onCreate(savedInstanceState);
    setVolumeControlStream(AudioManager.STREAM_MUSIC);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    IncomingSharePlugin.handleIncomingIntent(intent);
  }

  @Override
  public void onStart() {
    super.onStart();
    if (getBridge() == null) return;
    WebView webView = getBridge().getWebView();
    if (webView == null) return;
    WebSettings settings = webView.getSettings();
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setJavaScriptCanOpenWindowsAutomatically(true);
  }
}
