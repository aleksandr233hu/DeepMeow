package com.deepseek.local;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.FileInputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 历史归档的原生读取：系统文件选择器拿到 content URI 后按偏移直读。
 *
 * WebView 的 file input 会把整个文件先复制到自己的缓存，几百 MB 的导出包要等几十秒；
 * 这里直接打开文件描述符按需读取，跳过的条目完全不碰数据。
 */
@CapacitorPlugin(name = "HistoryFile")
public class HistoryFilePlugin extends Plugin {

    private final Map<String, OpenedFile> opened = new HashMap<>();

    private static final class OpenedFile {
        final ParcelFileDescriptor descriptor;
        final FileInputStream stream;
        final FileChannel channel;

        OpenedFile(ParcelFileDescriptor descriptor, FileInputStream stream, FileChannel channel) {
            this.descriptor = descriptor;
            this.stream = stream;
            this.channel = channel;
        }

        void close() {
            try {
                channel.close();
            } catch (Exception ignored) {
            }
            try {
                stream.close();
            } catch (Exception ignored) {
            }
            try {
                descriptor.close();
            } catch (Exception ignored) {
            }
        }
    }

    /** 打开系统文件选择器；取消时返回 null。 */
    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // 各家文件管理器给 ZIP 的 MIME 不一致，这里不限制类型，由导入流程校验内容。
        intent.setType("*/*");
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            // 用户取消选择，不是错误
            call.resolve();
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            call.reject("没有选择文件");
            return;
        }
        try {
            ParcelFileDescriptor descriptor = getContext().getContentResolver().openFileDescriptor(uri, "r");
            if (descriptor == null) {
                call.reject("无法打开文件");
                return;
            }
            FileInputStream stream = new FileInputStream(descriptor.getFileDescriptor());
            FileChannel channel = stream.getChannel();
            String token = UUID.randomUUID().toString();
            opened.put(token, new OpenedFile(descriptor, stream, channel));

            String name = uri.getLastPathSegment();
            JSObject ret = new JSObject();
            ret.put("token", token);
            ret.put("name", name == null || name.isEmpty() ? "history.zip" : name);
            ret.put("size", channel.size());
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("无法读取文件: " + error.getMessage(), error);
        }
    }

    /** 按偏移读取一段字节，返回 base64。 */
    @PluginMethod
    public void read(PluginCall call) {
        String token = call.getString("token");
        Double offsetValue = call.getDouble("offset");
        Integer lengthValue = call.getInt("length");
        if (token == null || offsetValue == null || lengthValue == null) {
            call.reject("参数不完整");
            return;
        }
        OpenedFile file = opened.get(token);
        if (file == null) {
            call.reject("文件已关闭");
            return;
        }
        int length = Math.max(0, lengthValue);
        try {
            ByteBuffer buffer = ByteBuffer.allocate(length);
            file.channel.position(offsetValue.longValue());
            while (buffer.hasRemaining()) {
                int read = file.channel.read(buffer);
                if (read < 0) {
                    break;
                }
            }
            byte[] bytes = new byte[buffer.position()];
            buffer.flip();
            buffer.get(bytes);

            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("读取失败: " + error.getMessage(), error);
        }
    }

    /** 释放文件描述符；重复关闭不报错。 */
    @PluginMethod
    public void close(PluginCall call) {
        String token = call.getString("token");
        if (token != null) {
            OpenedFile file = opened.remove(token);
            if (file != null) {
                file.close();
            }
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        for (OpenedFile file : opened.values()) {
            file.close();
        }
        opened.clear();
        super.handleOnDestroy();
    }
}
