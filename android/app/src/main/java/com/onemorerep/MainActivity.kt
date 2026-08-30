package com.onemorerep

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "OneMoreRep"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * `null`, deliberately — required by react-native-screens.
   *
   * Android hands back a saved instance state whenever it recreates the
   * activity: after a process kill, a locale or theme change, or with
   * "Don't keep activities" on. The fragment manager then rebuilds the screen
   * fragments from that bundle, and `ScreenFragment` throws on sight of one:
   *
   *   IllegalStateException: Screen fragments should never be restored.
   *
   * React Navigation owns the navigation state and rebuilds it from JavaScript,
   * so there is nothing in that bundle worth keeping. This crash was found in
   * the device's crash log, and it is also why the app came back on a pushed
   * screen after its data was cleared rather than on the home screen.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
