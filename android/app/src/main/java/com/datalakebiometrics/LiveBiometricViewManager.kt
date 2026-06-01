package com.datalakebiometrics

import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.annotations.ReactProp

class LiveBiometricViewManager : ViewGroupManager<LiveBiometricView>() {
    override fun getName() = "LiveBiometricView"

    override fun createViewInstance(reactContext: ThemedReactContext): LiveBiometricView {
        return LiveBiometricView(reactContext)
    }

    @ReactProp(name = "mode")
    fun setMode(view: LiveBiometricView, mode: String) {
        view.setMode(mode)
    }

    @ReactProp(name = "registerName")
    fun setRegisterName(view: LiveBiometricView, name: String) {
        view.setRegisterName(name)
    }

    override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> {
        return MapBuilder.builder<String, Any>()
            .put("onVerified", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onVerified")))
            .build()
    }
}