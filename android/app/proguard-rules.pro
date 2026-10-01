# Keep Supabase response models: they are resolved through kotlinx.serialization
# generated serializers, so the members must not be renamed or stripped.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

-keepclassmembers class com.pulse.logistics.** {
    *** Companion;
}
-keepclasseswithmembers class com.pulse.logistics.** {
    kotlinx.serialization.KSerializer serializer(...);
}
