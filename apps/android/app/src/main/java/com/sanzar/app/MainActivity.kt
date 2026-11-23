package com.sanzar.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.auth.FirebaseAuth
import com.sanzar.app.data.local.CourseEntity

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Color(0xFF16A34A),
                    secondary = Color(0xFF0F766E),
                    background = Color(0xFFF8FAFC)
                )
            ) {
                SanzarAppScreen()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SanzarAppScreen() {
    val auth = remember { FirebaseAuth.getInstance() }
    var user by remember { mutableStateOf(auth.currentUser) }
    var selectedTab by remember { mutableIntStateOf(0) }

    val sampleCourses = remember {
        listOf(
            CourseEntity("c1", "Everyday Bengali", "Fundamental communication & dialogue", "Beginner", 1),
            CourseEntity("c2", "Grammar Masterclass", "Structured sentence mechanics & syntax", "Intermediate", 2),
            CourseEntity("c3", "Vocabulary Accelerator", "Core 1,000 words with phonetics", "All Levels", 3)
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF16A34A),
                            modifier = Modifier.size(32.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text("S", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        Text("SANZAR", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                    }
                },
                actions = {
                    IconButton(onClick = { /* manual sync trigger */ }) {
                        Icon(Icons.Default.Sync, contentDescription = "Sync", tint = Color(0xFF16A34A))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Book, contentDescription = "Learn") },
                    label = { Text("Learn") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.Person, contentDescription = "Profile") },
                    label = { Text("Profile") }
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF8FAFC))
                .padding(16.dp)
        ) {
            if (selectedTab == 0) {
                Text(
                    text = "Offline-First Learning",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0F172A)
                )
                Text(
                    text = "All lessons and flashcards persist locally in Room.",
                    fontSize = 13.sp,
                    color = Color(0xFF64748B),
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(sampleCourses) { course ->
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = course.level.uppercase(),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF16A34A)
                                )
                                Text(
                                    text = course.title,
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF1E293B)
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = course.description,
                                    fontSize = 13.sp,
                                    color = Color(0xFF64748B)
                                )
                            }
                        }
                    }
                }
            } else {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            text = "Account & Synchronization",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = if (user != null) "Logged in as ${user?.email}" else "Guest Mode (Offline Only)",
                            fontSize = 14.sp,
                            color = Color(0xFF334155)
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = "Admin Email Target: sayimarafat676@gmail.com",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF16A34A)
                        )
                    }
                }
            }
        }
    }
}
