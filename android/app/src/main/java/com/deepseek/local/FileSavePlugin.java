package com.deepseek.local;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 原生保存文件：系统文件选择器（SAF）选定位置后，前端分块传 base64 写入。
 *
 * WebView 不会处理 <a download> 的 blob 下载，导出历史/备份必须走这里；
 * 分块写入避免把整个 ZIP 的 base64 一次性放进内存。
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {

    private final Map<String, OutputStream> streams = new HashMap<>();

    /** 弹出系统「另存为」，返回本次写入的 id */
    @PluginMethod
    public void create(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (fileName == null || fileName.isEmpty()) {
            call.reject("缺少文件名");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "saveResult");
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("canceled");
            return;
        }
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (uri == null) {
            call.reject("没有拿到保存位置");
            return;
        }
        try {
            OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt");
            if (stream == null) {
                call.reject("无法写入文件");
                return;
            }
            String id = UUID.randomUUID().toString();
            streams.put(id, stream);
            JSObject ret = new JSObject();
            ret.put("id", id);
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("无法写入文件: " + error.getMessage(), error);
        }
    }

    /** 追加一块 base64 数据 */
    @PluginMethod
    public void write(PluginCall call) {
        String id = call.getString("id");
        String data = call.getString("data");
        if (id == null || data == null) {
            call.reject("缺少写入参数");
            return;
        }
        OutputStream stream = streams.get(id);
        if (stream == null) {
            call.reject("保存已结束");
            return;
        }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            stream.write(bytes);
            JSObject ret = new JSObject();
            ret.put("bytes", bytes.length);
            call.resolve(ret);
        } catch (Exception error) {
            closeStream(id);
            call.reject("写入失败: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("缺少 id");
            return;
        }
        try {
            closeStream(id);
            call.resolve();
        } catch (Exception error) {
            call.reject("关闭文件失败: " + error.getMessage(), error);
        }
    }

    private void closeStream(String id) {
        OutputStream stream = streams.remove(id);
        if (stream == null) {
            return;
        }
        try {
            stream.flush();
        } catch (Exception ignored) {
        }
        try {
            stream.close();
        } catch (Exception ignored) {
        }
    }
}
