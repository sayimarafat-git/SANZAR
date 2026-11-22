import 'package:flutter/material.dart';
import 'tokens.dart';

ThemeData buildTheme(Brightness b) {
  final p = b == Brightness.dark ? SanzarPalette.dark : SanzarPalette.light;
  final scheme = ColorScheme(
    brightness: b,
    primary: p.primary, onPrimary: p.onPrimary,
    secondary: SanzarColors.gold, onSecondary: SanzarColors.brandForest,
    error: SanzarColors.danger, onError: Colors.white,
    surface: p.surface, onSurface: p.text,
    surfaceContainerHighest: p.surface2, onSurfaceVariant: p.muted,
    outline: p.border, primaryContainer: p.primarySoft, onPrimaryContainer: p.primary,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: b);
  final rounded = RoundedRectangleBorder(borderRadius: BorderRadius.circular(SanzarRadius.md));
  return base.copyWith(
    scaffoldBackgroundColor: p.bg,
    textTheme: base.textTheme.apply(bodyColor: p.text, displayColor: p.text),
    appBarTheme: AppBarTheme(backgroundColor: p.bg, foregroundColor: p.text, elevation: 0, scrolledUnderElevation: 0, centerTitle: false),
    cardTheme: CardThemeData(color: p.surface, elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SanzarRadius.lg), side: BorderSide(color: p.border))),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), shape: rounded, textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), shape: rounded, side: BorderSide(color: p.border))),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: p.surface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(SanzarRadius.sm), borderSide: BorderSide(color: p.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(SanzarRadius.sm), borderSide: BorderSide(color: p.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(SanzarRadius.sm), borderSide: BorderSide(color: p.primary, width: 1.6)),
    ),
    navigationBarTheme: NavigationBarThemeData(backgroundColor: p.surface, indicatorColor: p.primarySoft, height: 70, labelBehavior: NavigationDestinationLabelBehavior.alwaysShow),
    dividerTheme: DividerThemeData(color: p.border, space: 1),
  );
}
