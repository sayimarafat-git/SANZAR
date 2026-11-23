package com.sanzar.app.ui.components

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sanzar.app.core.LocalStrings
import com.sanzar.app.ui.theme.LocalSanzarPalette
import com.sanzar.app.ui.theme.SanzarColors
import com.sanzar.app.ui.theme.SanzarRadius
import com.sanzar.app.ui.theme.SanzarSpace
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.ConcurrentHashMap

@Composable
fun BrandMark(
    size: Dp = 72.dp,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.30f))
            .background(SanzarColors.BrandGradient),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "S",
            color = Color.White,
            fontSize = (size.value * 0.54f).sp,
            fontWeight = FontWeight.Black
        )
    }
}

@Composable
fun SanzarCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    containerColor: Color = LocalSanzarPalette.current.surface,
    content: @Composable ColumnScope.() -> Unit
) {
    val palette = LocalSanzarPalette.current
    val shape = RoundedCornerShape(SanzarRadius.LG.dp)
    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier,
            shape = shape,
            colors = CardDefaults.cardColors(containerColor = containerColor),
            border = BorderStroke(1.dp, palette.border),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            content = content
        )
    } else {
        Card(
            modifier = modifier,
            shape = shape,
            colors = CardDefaults.cardColors(containerColor = containerColor),
            border = BorderStroke(1.dp, palette.border),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            content = content
        )
    }
}

@Composable
fun SectionTitle(
    title: String,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(
                start = SanzarSpace.S4.dp,
                end = SanzarSpace.S4.dp,
                top = SanzarSpace.S5.dp,
                bottom = SanzarSpace.S2.dp
            ),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            modifier = Modifier.weight(1f)
        )
        if (trailing != null) trailing()
    }
}

private val coverHttpClient by lazy { OkHttpClient() }
private val coverBitmapCache = ConcurrentHashMap<String, ImageBitmap>()

@Composable
fun BookCover(
    colors: List<String>,
    title: String,
    width: Dp = 96.dp,
    imageUrl: String? = null,
    aspectRatio: Float? = null,
    modifier: Modifier = Modifier
) {
    val c1 = SanzarColors.parseHex(colors.getOrNull(0), SanzarColors.BrandEmerald)
    val c2 = SanzarColors.parseHex(colors.getOrNull(1), SanzarColors.BrandJade)
    val safeRatio = (aspectRatio ?: 0.75f).coerceIn(0.45f, 2.0f)
    val targetWidth = if (safeRatio > 1.05f) (width * 1.25f) else width
    val targetHeight = targetWidth / safeRatio

    var bitmap by remember(imageUrl) { mutableStateOf(imageUrl?.let { coverBitmapCache[it] }) }
    LaunchedEffect(imageUrl) {
        if (imageUrl.isNullOrBlank() || bitmap != null) return@LaunchedEffect
        val loaded = withContext(Dispatchers.IO) {
            runCatching {
                if (imageUrl.startsWith("data:image/")) {
                    val base64Part = imageUrl.substringAfter(",", "")
                    val bytes = Base64.decode(base64Part, Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                } else if (imageUrl.startsWith("https://")) {
                    coverHttpClient.newCall(Request.Builder().url(imageUrl).build()).execute().use { resp ->
                        if (!resp.isSuccessful) null
                        else resp.body?.bytes()?.let { b ->
                            BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap()
                        }
                    }
                } else null
            }.getOrNull()
        }
        if (loaded != null) {
            coverBitmapCache[imageUrl] = loaded
            bitmap = loaded
        }
    }

    if (bitmap != null) {
        Image(
            bitmap = bitmap!!,
            contentDescription = title,
            contentScale = ContentScale.Fit,
            modifier = modifier
                .width(targetWidth)
                .height(targetHeight)
                .clip(RoundedCornerShape(SanzarRadius.SM.dp))
                .background(Color.White)
        )
    } else {
        Box(
            modifier = modifier
                .width(targetWidth)
                .height(targetHeight)
                .clip(RoundedCornerShape(SanzarRadius.SM.dp))
                .background(Brush.linearGradient(listOf(c1, c2)))
                .padding(SanzarSpace.S2.dp),
            contentAlignment = Alignment.BottomStart
        ) {
            Text(
                text = title,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = (width.value / 8.5f).coerceAtLeast(9f).sp,
                lineHeight = (width.value / 7.2f).coerceAtLeast(11f).sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun SubjectBadge(
    subjectId: String,
    label: String,
    modifier: Modifier = Modifier
) {
    val color = SanzarColors.forSubject(subjectId)
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(999.dp),
        color = color.copy(alpha = 0.14f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(color)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = label,
                color = color,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun SanzarPill(
    text: String,
    icon: ImageVector? = null,
    containerColor: Color = LocalSanzarPalette.current.primarySoft,
    contentColor: Color = LocalSanzarPalette.current.primary,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(999.dp),
        color = containerColor,
        contentColor = contentColor
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(5.dp))
            }
            Text(text = text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun GradientHeroCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SanzarRadius.LG.dp))
            .background(SanzarColors.HeroGradient)
            .padding(SanzarSpace.S5.dp)
    ) {
        Column(content = content)
    }
}

@Composable
fun SanzarProgressBar(
    progress: Float,
    color: Color = LocalSanzarPalette.current.primary,
    trackColor: Color = LocalSanzarPalette.current.primarySoft,
    height: Dp = 10.dp,
    modifier: Modifier = Modifier
) {
    LinearProgressIndicator(
        progress = { progress.coerceIn(0f, 1f) },
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(999.dp)),
        color = color,
        trackColor = trackColor
    )
}

@Composable
fun OfflineBanner(
    text: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(SanzarRadius.SM.dp),
        color = SanzarColors.Warning.copy(alpha = 0.14f),
        border = BorderStroke(1.dp, SanzarColors.Warning.copy(alpha = 0.4f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Rounded.CloudOff, contentDescription = null, tint = SanzarColors.Warning, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(text = text, style = MaterialTheme.typography.bodySmall, color = LocalSanzarPalette.current.text)
        }
    }
}

@Composable
fun EmptyStateView(
    message: String,
    icon: ImageVector = Icons.Rounded.MenuBook,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(SanzarSpace.S8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = LocalSanzarPalette.current.muted
        )
        Spacer(Modifier.height(SanzarSpace.S3.dp))
        Text(
            text = message,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodyMedium,
            color = LocalSanzarPalette.current.muted
        )
    }
}

@Composable
fun ErrorRetryView(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    val s = LocalStrings.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(SanzarSpace.S6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Rounded.CloudOff,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = LocalSanzarPalette.current.muted
        )
        Spacer(Modifier.height(SanzarSpace.S3.dp))
        Text(text = message, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(SanzarSpace.S4.dp))
        OutlinedButton(onClick = onRetry, shape = RoundedCornerShape(SanzarRadius.MD.dp)) {
            Text(s("retry"))
        }
    }
}

fun subjectIcon(icon: String): ImageVector = when (icon) {
    "calc" -> Icons.Rounded.Calculate
    "atom" -> Icons.Rounded.Science
    "flask" -> Icons.Rounded.Biotech
    "leaf" -> Icons.Rounded.Eco
    "lang" -> Icons.Rounded.Translate
    "monitor" -> Icons.Rounded.Computer
    "feather" -> Icons.Rounded.EditNote
    else -> Icons.Rounded.GridView
}
