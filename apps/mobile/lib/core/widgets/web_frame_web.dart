import 'dart:ui_web' as ui;

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

int _nextFrameId = 0;

class WebFrame extends StatefulWidget {
  final String src;
  const WebFrame({super.key, required this.src});

  @override
  State<WebFrame> createState() => _WebFrameState();
}

class _WebFrameState extends State<WebFrame> {
  late final String _viewType;

  @override
  void initState() {
    super.initState();
    _viewType = 'sanzar-frame-${_nextFrameId++}';
    ui.platformViewRegistry.registerViewFactory(_viewType, (_) {
      return web.HTMLIFrameElement()
        ..src = widget.src
        ..title = 'Sanzar resource preview'
        ..allowFullscreen = true
        ..referrerPolicy = 'strict-origin-when-cross-origin'
        ..setAttribute(
          'allow',
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
        )
        ..setAttribute('style', 'border: 0; width: 100%; height: 100%');
    });
  }

  @override
  Widget build(BuildContext context) => HtmlElementView(viewType: _viewType);
}
