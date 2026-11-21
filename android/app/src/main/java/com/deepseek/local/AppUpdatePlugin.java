package com.deepseek.local;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 应用内更新：读取本机版本、下载新 APK 到缓存、调起系统安装器覆盖安装。
 * 覆盖安装要求新包同包名同签名且 versionCode 更大，本地数据不受影响。
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            JSObject ret = new JSObject();
            ret.put("versionName", info.versionName);
            ret.put("versionCode",
                    Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("无法读取版本信息: " + error.getMessage(), error);
        }
    }

    /** 后台线程流式下载，通过 progress 事件回报字节进度。 */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                File target = new File(getContext().getCacheDir(), "DeepMeow-update.apk");
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();
                int code = connection.getResponseCode();
                if (code != HttpURLConnection.HTTP_OK) {
                    call.reject("下载失败：HTTP " + code);
                    return;
                }
                long total = connection.getContentLengthLong();
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[64 * 1024];
                    long done = 0;
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        done += read;
                        JSObject progress = new JSObject();
                        progress.put("loaded", done);
                        progress.put("total", total);
                        notifyListeners("progress", progress);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("path", target.getAbsolutePath());
                ret.put("size", target.length());
                call.resolve(ret);
            } catch (Exception error) {
                call.reject("下载失败: " + error.getMessage(), error);
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }).start();
    }

    /** 原生 HTTP 拉取文本（网页热更清单），不走 WebView 的 CORS 与网络策略。 */
    @PluginMethod
    public void fetchText(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("缺少请求地址");
            return;
        }
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(20000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "application/json");
                int code = connection.getResponseCode();
                if (code != HttpURLConnection.HTTP_OK) {
                    call.reject("请求失败：HTTP " + code);
                    return;
                }
                try (InputStream input = connection.getInputStream()) {
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    byte[] buffer = new byte[16 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                    }
                    JSObject ret = new JSObject();
                    ret.put("text", output.toString("UTF-8"));
                    call.resolve(ret);
                }
            } catch (Exception error) {
                call.reject("请求失败: " + error.getMessage(), error);
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }).start();
    }

    /** 通过 FileProvider 授权并调起系统安装器；用户确认后走覆盖安装。 */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("缺少安装包路径");
            return;
        }
        try {
            File file = new File(path);
            if (!file.exists()) {
                call.reject("安装包不存在，请重新下载");
                return;
            }
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("无法启动安装: " + error.getMessage(), error);
        }
    }
}
