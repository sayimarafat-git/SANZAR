package com.sanzar.app.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "books")
data class BookEntity(
    @PrimaryKey val id: String,
    val title: String,
    val subjectId: String,
    val edition: String,
    val author: String,
    val coverJson: String,
    val levelsJson: String,
    val featuredRank: Int?,
    val sortOrder: Int,
    val coverImage: String? = null,
    val coverRatio: Float? = null
)

@Entity(
    tableName = "chapters",
    indices = [Index(value = ["bookId"])]
)
data class ChapterEntity(
    @PrimaryKey val id: String,
    val bookId: String,
    val number: Int,
    val title: String,
    val hasNotes: Boolean,
    val questionCount: Int
)

@Entity(
    tableName = "resources",
    indices = [Index(value = ["chapterId"])]
)
data class ResourceEntity(
    @PrimaryKey val id: String,
    val chapterId: String,
    val type: String,
    val title: String,
    val url: String?,
    val pages: Int,
    val version: Int,
    val sha256: String?,
    val sizeBytes: Long
)

@Entity(
    tableName = "notes",
    indices = [Index(value = ["chapterId"])]
)
data class NoteEntity(
    @PrimaryKey val id: String,
    val chapterId: String,
    val sectionIndex: Int,
    val heading: String,
    val text: String,
    val page: Int?
)

@Entity(tableName = "exams")
data class ExamEntity(
    @PrimaryKey val id: String,
    val title: String,
    val type: String,
    val bookId: String?,
    val chapterId: String?,
    val durationSec: Int,
    val questionCount: Int,
    val passPct: Int
)

@Entity(tableName = "user_progress")
data class ProgressEntity(
    @PrimaryKey val itemId: String,
    val isCompleted: Boolean,
    val xpAwarded: Int = 0,
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "pending_sync")
data class PendingSyncEntity(
    @PrimaryKey val operationId: String,
    val type: String,
    val payloadJson: String,
    val createdAt: Long = System.currentTimeMillis(),
    val synced: Boolean = false
)

@Entity(tableName = "installed_resources")
data class InstalledResourceEntity(
    @PrimaryKey val resourceId: String,
    val version: Int,
    val localPath: String,
    val sha256: String,
    val sizeBytes: Long,
    val installedAt: Long = System.currentTimeMillis()
)

@Dao
interface CatalogDao {
    @Query("SELECT * FROM books ORDER BY sortOrder ASC")
    fun observeBooks(): Flow<List<BookEntity>>

    @Query("SELECT * FROM chapters ORDER BY number ASC")
    fun observeChapters(): Flow<List<ChapterEntity>>

    @Query("SELECT * FROM resources")
    fun observeResources(): Flow<List<ResourceEntity>>

    @Query("SELECT * FROM notes ORDER BY sectionIndex ASC")
    fun observeNotes(): Flow<List<NoteEntity>>

    @Query("SELECT * FROM exams")
    fun observeExams(): Flow<List<ExamEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBooks(items: List<BookEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChapters(items: List<ChapterEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertResources(items: List<ResourceEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertNotes(items: List<NoteEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertExams(items: List<ExamEntity>)

    @Query("DELETE FROM books")
    suspend fun clearBooks()

    @Query("DELETE FROM chapters")
    suspend fun clearChapters()

    @Query("DELETE FROM resources")
    suspend fun clearResources()

    @Query("DELETE FROM notes")
    suspend fun clearNotes()

    @Query("DELETE FROM exams")
    suspend fun clearExams()

    @Transaction
    suspend fun replaceCatalog(
        books: List<BookEntity>,
        chapters: List<ChapterEntity>,
        resources: List<ResourceEntity>,
        notes: List<NoteEntity>,
        exams: List<ExamEntity>
    ) {
        clearResources()
        clearNotes()
        clearChapters()
        clearBooks()
        clearExams()
        insertBooks(books)
        insertChapters(chapters)
        insertResources(resources)
        insertNotes(notes)
        insertExams(exams)
    }
}

@Dao
interface ProgressDao {
    @Query("SELECT * FROM user_progress")
    fun observeProgress(): Flow<List<ProgressEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProgress(item: ProgressEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<ProgressEntity>)

    @Query("DELETE FROM user_progress")
    suspend fun clearAll()
}

@Dao
interface PendingSyncDao {
    @Query("SELECT * FROM pending_sync WHERE synced = 0 ORDER BY createdAt ASC")
    suspend fun getPending(): List<PendingSyncEntity>

    @Query("SELECT COUNT(*) FROM pending_sync WHERE synced = 0")
    fun observePendingCount(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun enqueue(op: PendingSyncEntity)

    @Query("UPDATE pending_sync SET synced = 1 WHERE operationId IN (:ids)")
    suspend fun markSynced(ids: List<String>)

    @Query("DELETE FROM pending_sync WHERE synced = 1")
    suspend fun pruneSynced()
}

@Dao
interface InstalledResourceDao {
    @Query("SELECT * FROM installed_resources")
    fun observeInstalled(): Flow<List<InstalledResourceEntity>>

    @Query("SELECT * FROM installed_resources WHERE resourceId = :resourceId LIMIT 1")
    suspend fun getById(resourceId: String): InstalledResourceEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: InstalledResourceEntity)

    @Query("DELETE FROM installed_resources WHERE resourceId = :resourceId")
    suspend fun deleteById(resourceId: String)
}

@Database(
    entities = [
        BookEntity::class,
        ChapterEntity::class,
        ResourceEntity::class,
        NoteEntity::class,
        ExamEntity::class,
        ProgressEntity::class,
        PendingSyncEntity::class,
        InstalledResourceEntity::class
    ],
    version = 3,
    exportSchema = false
)
abstract class SanzarDatabase : RoomDatabase() {
    abstract fun catalogDao(): CatalogDao
    abstract fun progressDao(): ProgressDao
    abstract fun pendingSyncDao(): PendingSyncDao
    abstract fun installedResourceDao(): InstalledResourceDao
}
