package com.sanzar.app.data.remote

import android.content.Context
import com.sanzar.app.data.local.InstalledResourceDao
import com.sanzar.app.data.local.InstalledResourceEntity
import com.sanzar.app.data.model.ResourceItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

sealed class DownloadResult {
    data class Success(val entity: InstalledResourceEntity, val alreadyCached: Boolean) : DownloadResult()
    data class Failure(val reason: String) : DownloadResult()
}

class ResourceDownloader(
    private val context: Context,
    private val installedDao: InstalledResourceDao
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .build()

    private val storageDir: File
        get() = File(context.filesDir, "sanzar_resources").apply { mkdirs() }

    suspend fun downloadResource(
        resource: ResourceItem,
        expectedSha256: String? = resource.sha256,
        onProgress: (Float) -> Unit = {}
    ): DownloadResult = withContext(Dispatchers.IO) {
        val url = resource.url ?: return@withContext DownloadResult.Failure("Missing resource URL")
        val existing = installedDao.getById(resource.id)
        if (existing != null && existing.version == resource.version) {
            val file = File(existing.localPath)
            if (file.exists()) {
                val actualHash = computeSha256(file)
                val hashOk = expectedSha256.isNullOrBlank() || actualHash.equals(expectedSha256, ignoreCase = true)
                if (hashOk && actualHash.equals(existing.sha256, ignoreCase = true)) {
                    onProgress(1f)
                    return@withContext DownloadResult.Success(existing, alreadyCached = true)
                }
            }
        }

        val safeName = resource.id.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val ext = when (resource.type) {
            "pdf" -> "pdf"
            "video" -> "mp4"
            "ppt" -> "pptx"
            else -> "bin"
        }
        val finalFile = File(storageDir, "${safeName}_v${resource.version}.$ext")
        val tempFile = File(storageDir, "${safeName}_v${resource.version}.$ext.part")
        if (tempFile.exists()) tempFile.delete()

        try {
            val request = Request.Builder().url(url).get().build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext DownloadResult.Failure("HTTP ${response.code}")
                }
                val body = response.body ?: return@withContext DownloadResult.Failure("Empty response")
                val totalBytes = body.contentLength()
                val digest = MessageDigest.getInstance("SHA-256")
                var written = 0L

                body.byteStream().use { input ->
                    FileOutputStream(tempFile).use { output ->
                        val buffer = ByteArray(8192)
                        while (true) {
                            val read = input.read(buffer)
                            if (read == -1) break
                            output.write(buffer, 0, read)
                            digest.update(buffer, 0, read)
                            written += read
                            if (totalBytes > 0) {
                                onProgress((written.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f))
                            }
                        }
                        output.fd.sync()
                    }
                }

                val computedSha = digest.digest().joinToString("") { "%02x".format(it) }
                if (!expectedSha256.isNullOrBlank() && !computedSha.equals(expectedSha256, ignoreCase = true)) {
                    tempFile.delete()
                    return@withContext DownloadResult.Failure("Checksum verification failed")
                }

                if (finalFile.exists()) finalFile.delete()
                if (!tempFile.renameTo(finalFile)) {
                    tempFile.copyTo(finalFile, overwrite = true)
                    tempFile.delete()
                }

                val entity = InstalledResourceEntity(
                    resourceId = resource.id,
                    version = resource.version,
                    localPath = finalFile.absolutePath,
                    sha256 = computedSha,
                    sizeBytes = finalFile.length(),
                    installedAt = System.currentTimeMillis()
                )
                installedDao.upsert(entity)
                onProgress(1f)
                DownloadResult.Success(entity, alreadyCached = false)
            }
        } catch (e: Exception) {
            tempFile.delete()
            DownloadResult.Failure(e.message ?: "Download failed")
        }
    }

    suspend fun removeResource(resourceId: String) = withContext(Dispatchers.IO) {
        val existing = installedDao.getById(resourceId)
        if (existing != null) {
            File(existing.localPath).delete()
        }
        installedDao.deleteById(resourceId)
    }

    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(8192)
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
