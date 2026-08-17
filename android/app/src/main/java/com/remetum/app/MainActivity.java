package com.remetum.app;

import android.media.AudioManager;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setVolumeControlStream(AudioManager.STREAM_MUSIC);
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
