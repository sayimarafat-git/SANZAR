import 'package:flutter/material.dart';

/// Shared Sanzar design tokens.
class SanzarColors {
  static const brandEmerald = Color(0xFF176B4B);
  static const brandJade = Color(0xFF247754);
  static const brandForest = Color(0xFF12392A);
  static const success = Color(0xFF19B46B);
  static const warning = Color(0xFFF5A524);
  static const danger = Color(0xFFEF4444);
  static const gold = Color(0xFFC6A46A);

  static const brandGradient = LinearGradient(colors: [Color(0xFF0B523B), Color(0xFF146C4D), Color(0xFF247754)], stops: [0, .55, 1]);
  static const heroGradient = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF0B1D14), Color(0xFF12402D), Color(0xFF1D6044)], stops: [0, .55, 1]);

  /// Subject colours keyed by subject id (fallback: `others`).
  static const subject = <String, Color>{
    'math': Color(0xFF3D6BFF), 'physics': Color(0xFF3E8092), 'chemistry': Color(0xFFD97A3E), 'biology': Color(0xFF258A5C),
    'english': Color(0xFFD95D72), 'ict': Color(0xFF1A86A0), 'bangla': Color(0xFFB28A45), 'others': Color(0xFF66786D),
  };
  static Color forSubject(String id) => subject[id] ?? subject['others']!;
}

class SanzarPalette {
  final Color bg, surface, surface2, text, text2, muted, border, primary, onPrimary, primarySoft;
  const SanzarPalette({required this.bg, required this.surface, required this.surface2, required this.text, required this.text2, required this.muted, required this.border, required this.primary, required this.onPrimary, required this.primarySoft});

  static const light = SanzarPalette(bg: Color(0xFFF2F6F1), surface: Color(0xFFFFFFFF), surface2: Color(0xFFF4F7F2), text: Color(0xFF15251B), text2: Color(0xFF42584A), muted: Color(0xFF637268), border: Color(0xFFDCE7DE), primary: Color(0xFF176B4B), onPrimary: Color(0xFFFFFFFF), primarySoft: Color(0xFFE2F0E7));
  static const dark = SanzarPalette(bg: Color(0xFF09140F), surface: Color(0xFF13231A), surface2: Color(0xFF1B2D22), text: Color(0xFFEEF5EF), text2: Color(0xFFC8D7CA), muted: Color(0xFF92A496), border: Color(0xFF2C4233), primary: Color(0xFF6FC294), onPrimary: Color(0xFF102017), primarySoft: Color(0xFF1D3D2B));
}

class SanzarRadius {
  static const xs = 8.0, sm = 12.0, md = 16.0, lg = 20.0, xl = 28.0;
}

class SanzarSpace {
  static const s1 = 4.0, s2 = 8.0, s3 = 12.0, s4 = 16.0, s5 = 20.0, s6 = 24.0, s8 = 32.0;
}
