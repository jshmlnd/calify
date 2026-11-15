package com.calify.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

// Spotify only allows https or 127.0.0.1 redirects, so sign-in lands on a one-shot loopback socket here,
// then bounces the browser back into the app via calify://auth.
@CapacitorPlugin(name = "LoopbackAuth")
public class LoopbackAuthPlugin extends Plugin {
    // Must match the redirect URI registered on the Spotify dashboard: http://127.0.0.1:43821/callback
    private static final int PORT = 43821;
    private ServerSocket server;

    @PluginMethod
    public void listen(PluginCall call) {
        try {
            close();
            server = new ServerSocket(PORT, 4, InetAddress.getByName("127.0.0.1"));
            server.setSoTimeout(5 * 60 * 1000);
            JSObject r = new JSObject();
            r.put("port", server.getLocalPort());
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Couldn't start sign-in: " + e.getMessage());
        }
    }

    @PluginMethod
    public void waitForCode(PluginCall call) {
        final ServerSocket srv = server;
        if (srv == null) { call.reject("Call listen() first"); return; }
        new Thread(() -> {
            try {
                while (true) {
                    try (Socket s = srv.accept()) {
                        BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                        String line = in.readLine(); // "GET /callback?code=...&state=... HTTP/1.1"
                        if (line == null || !line.startsWith("GET /callback")) {
                            reply(s, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                            continue; // browsers open speculative connections and ask for /favicon.ico
                        }
                        String target = line.split(" ")[1];
                        int q = target.indexOf('?');
                        reply(s, "HTTP/1.1 302 Found\r\nLocation: calify://auth\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                        JSObject r = new JSObject();
                        r.put("query", q >= 0 ? target.substring(q) : "");
                        call.resolve(r);
                        return;
                    }
                }
            } catch (Exception e) {
                call.reject("Spotify sign-in timed out");
            } finally {
                close();
            }
        }).start();
    }

    private static void reply(Socket s, String head) throws Exception {
        OutputStream out = s.getOutputStream();
        out.write(head.getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private void close() {
        try { if (server != null) server.close(); } catch (Exception ignored) { }
        server = null;
    }
}
