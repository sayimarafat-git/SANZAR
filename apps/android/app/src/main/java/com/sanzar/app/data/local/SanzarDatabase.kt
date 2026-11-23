package com.sanzar.app.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "courses")
data class CourseEntity(
    @PrimaryKey val id: String,
    val title: String,
    val description: String,
    val level: String,
    val orderIndex: Int
)

@Entity(
    tableName = "lessons",
    foreignKeys = [
        ForeignKey(
            entity = CourseEntity::class,
            parentColumns = ["id"],
            childColumns = ["courseId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["courseId"])]
)
data class LessonEntity(
    @PrimaryKey val id: String,
    val courseId: String,
    val title: String,
    val contentMarkdown: String,
    val orderIndex: Int
)

@Entity(tableName = "user_progress")
data class ProgressEntity(
    @PrimaryKey val id: String,
    val courseId: String,
    val lessonId: String,
    val isCompleted: Boolean,
    val score: Int,
    val isPendingSync: Boolean = true,
    val updatedAt: Long = System.currentTimeMillis()
)

@Dao
interface LearningDao {
    @Query("SELECT * FROM courses ORDER BY orderIndex ASC")
    fun getAllCourses(): Flow<List<CourseEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCourses(courses: List<CourseEntity>)

    @Query("SELECT * FROM lessons WHERE courseId = :courseId ORDER BY orderIndex ASC")
    fun getLessonsForCourse(courseId: String): Flow<List<LessonEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLessons(lessons: List<LessonEntity>)

    @Query("SELECT * FROM user_progress WHERE isPendingSync = 1")
    suspend fun getPendingSyncProgress(): List<ProgressEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveProgress(progress: ProgressEntity)

    @Query("UPDATE user_progress SET isPendingSync = 0 WHERE id = :id")
    suspend fun markSynced(id: String)
}

@Database(entities = [CourseEntity::class, LessonEntity::class, ProgressEntity::class], version = 1, exportSchema = false)
abstract class SanzarDatabase : RoomDatabase() {
    abstract fun learningDao(): LearningDao
}
