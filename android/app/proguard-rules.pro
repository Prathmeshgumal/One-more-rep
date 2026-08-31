# Keep rules for R8, which runs on release builds only.
#
# React Native's AAR contributes the rules for the framework itself: anything
# annotated @DoNotStrip, every `native` method, everything implementing
# NativeModule or JavaScriptModule, and the bridge and TurboModule packages.
# Autolinked libraries that ship their own consumer rules -- reanimated,
# worklets, svg -- contribute theirs the same way. So this file only has to
# cover the libraries that ship none.
#
# The reason they need covering: each reaches its Java/Kotlin classes from C++
# or from the codegen'd component registry rather than from a call site R8 can
# follow, so without a rule R8 sees an unreferenced class and deletes it. The
# app then builds cleanly and crashes at runtime with ClassNotFoundException
# or UnsatisfiedLinkError. Keeping these packages whole costs little -- they
# are small next to AndroidX, Fresco and the Kotlin stdlib, which is where the
# dex weight actually was and which R8 is free to shred.

# op-sqlite: the database. Almost entirely JNI, and ships no consumer rules.
# Losing a class here means the app cannot open its own storage.
-keep class com.op.sqlite.** { *; }

# View managers and modules reached through the new architecture's generated
# component registry.
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.reactnativecommunity.cameraroll.** { *; }
-keep class fr.greweb.reactnativeviewshot.** { *; }

# Generated codegen specs and the registry that instantiates them by name.
-keep class com.facebook.react.viewmanagers.** { *; }
-keep class com.onemorerep.** { *; }

# R8 warns about compile-only references it cannot resolve in these libraries.
# They are not reachable at runtime; the warnings are noise that would
# otherwise fail the build.
-dontwarn com.facebook.react.**
-dontwarn com.swmansion.**
