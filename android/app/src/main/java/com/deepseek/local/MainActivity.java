package com.deepseek.local;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate 之前注册，否则 bridge 加载时拿不到插件
        registerPlugin(HistoryFilePlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
