package com.sanzar.app.ui.screens

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CenterFocusStrong
import androidx.compose.material.icons.rounded.MenuBook
import androidx.compose.material.icons.rounded.Translate
import androidx.compose.material.icons.rounded.VolunteerActivism
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.ui.components.BrandMark
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace
import kotlinx.coroutines.launch

@Composable
fun OnboardingScreen(
    onSelectLanguage: (String) -> Unit,
    onComplete: () -> Unit
) {
    val s = LocalStrings.current
    val palette = LocalSanzarPalette.current
    val pagerState = rememberPagerState(pageCount = { 3 })
    val scope = rememberCoroutineScope()
    var langMenuExpanded by remember { mutableStateOf(false) }

    val pages = remember {
        listOf(
            Triple(Icons.Rounded.MenuBook, "onb1.title", "onb1.body"),
            Triple(Icons.Rounded.CenterFocusStrong, "onb2.title", "onb2.body"),
            Triple(Icons.Rounded.VolunteerActivism, "onb3.title", "onb3.body")
        )
    }

    val isLast = pagerState.currentPage == pages.lastIndex

    Scaffold(containerColor = palette.bg) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = SanzarSpace.S4.dp, vertical = SanzarSpace.S3.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                BrandMark(size = 40.dp)
                Spacer(Modifier.weight(1f))
                Box {
                    IconButton(onClick = { langMenuExpanded = true }) {
                        Icon(Icons.Rounded.Translate, contentDescription = s("language"))
                    }
                    DropdownMenu(
                        expanded = langMenuExpanded,
                        onDismissRequest = { langMenuExpanded = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("বাংলা") },
                            onClick = {
                                langMenuExpanded = false
                                onSelectLanguage("bn")
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("English") },
                            onClick = {
                                langMenuExpanded = false
                                onSelectLanguage("en")
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("中文") },
                            onClick = {
                                langMenuExpanded = false
                                onSelectLanguage("zh")
                            }
                        )
                    }
                }
                TextButton(onClick = onComplete) {
                    Text(s("skip"))
                }
            }

            HorizontalPager(
                state = pagerState,
                modifier = Modifier.weight(1f)
            ) { page ->
                val (icon, titleKey, bodyKey) = pages[page]
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(SanzarSpace.S6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(180.dp)
                            .clip(CircleShape)
                            .background(SanzarColors.HeroGradient),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(84.dp)
                        )
                    }
                    Spacer(Modifier.height(SanzarSpace.S8.dp))
                    Text(
                        text = s(titleKey),
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(SanzarSpace.S3.dp))
                    Text(
                        text = s(bodyKey),
                        style = MaterialTheme.typography.bodyLarge,
                        color = palette.text2,
                        textAlign = TextAlign.Center
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center
            ) {
                repeat(pages.size) { idx ->
                    val selected = idx == pagerState.currentPage
                    val width by animateDpAsState(targetValue = if (selected) 24.dp else 8.dp, label = "dot")
                    Box(
                        modifier = Modifier
                            .padding(4.dp)
                            .height(8.dp)
                            .width(width)
                            .clip(RoundedCornerShape(4.dp))
                            .background(if (selected) palette.primary else palette.border)
                    )
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(SanzarSpace.S4.dp)
            ) {
                Button(
                    onClick = {
                        if (isLast) {
                            onComplete()
                        } else {
                            scope.launch {
                                pagerState.animateScrollToPage(pagerState.currentPage + 1)
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(SanzarRadius.MD.dp)
                ) {
                    Text(
                        text = s(if (isLast) "getStarted" else "next"),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}
