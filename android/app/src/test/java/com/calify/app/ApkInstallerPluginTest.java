package com.calify.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class ApkInstallerPluginTest {
    private static final String OK = "https://github.com/jshmlnd/calify/releases/download/v1.1.0/Calify-1.1.0.apk";

    @Test
    public void acceptsOwnReleaseApk() { assertNotNull(ApkInstallerPlugin.releaseApk(OK)); }

    @Test
    public void rejectsEverythingElse() {
        String[] bad = {
            null, "", "not a url",
            "http://github.com/jshmlnd/calify/releases/download/v1.1.0/Calify-1.1.0.apk",
            "https://evil.com/jshmlnd/calify/releases/download/v1.1.0/Calify-1.1.0.apk",
            "https://github.com.evil.com/jshmlnd/calify/releases/download/v1.1.0/Calify-1.1.0.apk",
            "https://github.com@evil.com/jshmlnd/calify/releases/download/v1.1.0/Calify-1.1.0.apk",
            "https://x@github.com/jshmlnd/calify/releases/download/v1.1.0/Calify-1.1.0.apk",
            "https://github.com:8443/jshmlnd/calify/releases/download/v1.1.0/Calify-1.1.0.apk",
            "https://github.com/jshmlnd/calify/releases/download/../../../x/y.apk",
            "https://github.com/jshmlnd/calify/releases/download/%2e%2e/%2e%2e/%2e%2e/x/y.apk",
            "https://github.com/other/calify/releases/download/v1/x.apk",
            "https://github.com/jshmlnd/calify/releases/download/v1.1.0/Calify-1.1.0.exe",
        };
        for (String u : bad) assertNull(u, ApkInstallerPlugin.releaseApk(u));
    }
}
