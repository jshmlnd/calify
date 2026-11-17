package com.calify.app;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

// Check for updates: downloads a Calify release APK to cache/updates/calify.apk and opens Android's installer.
// The first time, Android asks the user to allow "install unknown apps" for Calify.
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    private static final String RELEASES = "/jshmlnd/calify/releases/download/";
    // github.com redirects release downloads to its asset CDN (release-assets today, objects before).
    private static final List<String> HOSTS = Arrays.asList("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com");
    private final AtomicBoolean busy = new AtomicBoolean(false);

    // Only our own GitHub release assets may be installed: parsed and normalized so "../" can't escape the path.
    static URI releaseApk(String url) {
        try {
            URI u = new URI(url).normalize();
            String p = u.getPath();
            if ("https".equals(u.getScheme()) && "github.com".equals(u.getHost()) && u.getPort() == -1 && u.getUserInfo() == null
                && p != null && p.startsWith(RELEASES) && !p.contains("/../") && p.endsWith(".apk")) return u;
        } catch (Exception ignored) {}
        return null;
    }

    @PluginMethod
    public void install(PluginCall call) {
        URI start = releaseApk(call.getString("url"));
        if (start == null) { call.reject("Not a Calify release APK"); return; }
        if (!busy.compareAndSet(false, true)) { call.reject("An update is already downloading"); return; }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                dir.mkdirs();
                File apk = new File(dir, "calify.apk");
                apk.delete();   // never install a stale or partial file from an earlier run
                HttpURLConnection c = open(start);
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                } finally { c.disconnect(); }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            } finally {
                busy.set(false);
            }
        }).start();
    }

    // Follows redirects by hand so every hop stays on https and on GitHub's hosts.
    private static HttpURLConnection open(URI u) throws Exception {
        for (int hops = 0; hops < 5; hops++) {
            if (!"https".equals(u.getScheme()) || !HOSTS.contains(u.getHost())) throw new Exception("Download left GitHub");
            HttpURLConnection c = (HttpURLConnection) u.toURL().openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            int code = c.getResponseCode();
            if (code == 200) return c;
            String loc = c.getHeaderField("Location");
            c.disconnect();
            if (code < 300 || code > 399 || loc == null) throw new Exception("Download failed (" + code + ")");
            u = u.resolve(loc);
        }
        throw new Exception("Too many redirects");
    }
}
