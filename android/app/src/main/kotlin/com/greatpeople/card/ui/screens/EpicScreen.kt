package com.greatpeople.card.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

// ── Data ─────────────────────────────────────────────────────────────────────

private data class Story(
    val title: String,
    val figure: String?,
    val quizzes: Int,
)

private data class EraData(
    val name: String,
    val stories: List<Story>,
)

private val ERAS = listOf(
    EraData("Ancient", listOf(
        Story("Pyramid Builders",      "Imhotep",   4),
        Story("The First Empire",      "Sargon I",  4),
        Story("Geometry of the World", "Euclid",    4),
        Story("Sacred Medicine",       null,         4),
        Story("River Civilizations",   null,         3),
    )),
    EraData("Classical", listOf(
        Story("The Elements",          "Euclid", 4),
        Story("Senate and Forum",      null,      4),
        Story("Philosophy of Athens",  null,      3),
        Story("Olympic Games",         null,      3),
        Story("Eastern Trade",         null,      3),
    )),
    EraData("Medieval", listOf(
        Story("The Last General",       "Belisarius",  4),
        Story("Tea Ceremony",           "Lu Yu",        3),
        Story("The Disguised Warrior",  "Hua Mulan",   4),
        Story("The Knight's Code",      "Lancelot",    4),
        Story("Words of Sorrow",        "Li Qingzhao", 3),
    )),
    EraData("Renaissance", listOf(
        Story("Way of the Sword",   "Miyamoto Musashi", 4),
        Story("Art and Science",    null,                4),
        Story("The Printing Press", null,                3),
        Story("New Worlds",         null,                3),
        Story("Reformation",        null,                3),
    )),
    EraData("Steam", listOf(
        Story("Soul Force",          "Gandhi",          4),
        Story("Keys and Concertos",  "Clara Schumann",  3),
        Story("Garden of Genetics",  "Gregor Mendel",   4),
        Story("Symphony of Shadows", "Johannes Brahms", 3),
        Story("The Gilded Court",    "Louis XVI",       4),
    )),
    EraData("Electricity", listOf(
        Story("Breaking Enigma",    "Alan Turing",    4),
        Story("Fashion Revolution", "Coco Chanel",   3),
        Story("The Long March",     "Mao Zedong",    4),
        Story("A Martyr's Bullet",  "An Jung-geun",  3),
        Story("The Gilded Age",     "Andrew Mellon", 3),
    )),
    EraData("Information", listOf(
        Story("Breakfast at Tiffany's", "Audrey Hepburn", 4),
        Story("The Digital Revolution", null,              4),
        Story("The Global Village",     null,              3),
        Story("Climate Reckoning",      null,              3),
        Story("The New Frontier",       null,              3),
    )),
)

private const val STORIES_TO_ADVANCE = 4
private val Amber = Color(0xFFF59E0B)
private val BgColor = Color(0xFF080812)
private val Slate400 = Color(0xFF94A3B8)
private val Slate700 = Color(0xFF334155)

// ── EpicScreen ────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun EpicScreen(
    onBack: () -> Unit = {},
) {
    val pagerState = rememberPagerState(initialPage = 0, pageCount = { ERAS.size })
    val completed = remember { mutableStateMapOf<String, Boolean>() }
    var toastMsg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    var activeStory by remember { mutableStateOf<Pair<Int, Int>?>(null) }

    fun storyKey(eraIdx: Int, storyIdx: Int) = "$eraIdx-$storyIdx"

    fun isEraSelectable(eraIdx: Int): Boolean {
        if (eraIdx == 0) return true
        val prevDone = (0 until ERAS[eraIdx - 1].stories.size)
            .count { completed[storyKey(eraIdx - 1, it)] == true }
        return prevDone >= STORIES_TO_ADVANCE
    }

    fun isStoryUnlocked(eraIdx: Int, storyIdx: Int): Boolean {
        if (eraIdx == 0 && storyIdx == 0) return true
        if (!isEraSelectable(eraIdx)) return false
        if (storyIdx == 0) return true
        return completed[storyKey(eraIdx, storyIdx - 1)] == true
    }

    fun completedCount(eraIdx: Int) =
        (0 until ERAS[eraIdx].stories.size).count { completed[storyKey(eraIdx, it)] == true }

    fun showToast(msg: String) {
        toastMsg = msg
        scope.launch {
            kotlinx.coroutines.delay(2500)
            toastMsg = null
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Epic") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text("←", style = MaterialTheme.typography.titleMedium)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BgColor,
                    titleContentColor = Color.White,
                ),
            )
        },
        containerColor = BgColor,
        snackbarHost = {
            toastMsg?.let { msg ->
                Snackbar(
                    modifier = Modifier.padding(16.dp),
                    containerColor = Amber.copy(alpha = 0.2f),
                    contentColor = Amber,
                ) {
                    Text(msg)
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // Era tab row
            ScrollableTabRow(
                selectedTabIndex = pagerState.currentPage,
                containerColor = BgColor,
                contentColor = Amber,
                indicator = { tabPositions ->
                    if (pagerState.currentPage < tabPositions.size) {
                        TabRowDefaults.SecondaryIndicator(
                            modifier = Modifier.tabIndicatorOffset(tabPositions[pagerState.currentPage]),
                            color = Amber,
                        )
                    }
                },
                edgePadding = 8.dp,
            ) {
                ERAS.forEachIndexed { idx, era ->
                    val selectable = isEraSelectable(idx)
                    Tab(
                        selected = pagerState.currentPage == idx,
                        onClick = {
                            if (selectable) {
                                scope.launch { pagerState.animateScrollToPage(idx) }
                            } else {
                                showToast("Complete 4 stories in the current era first.")
                            }
                        },
                        text = {
                            Text(
                                era.name,
                                color = when {
                                    pagerState.currentPage == idx -> Amber
                                    selectable -> Color.White.copy(alpha = 0.7f)
                                    else -> Slate700
                                },
                                fontSize = 12.sp,
                            )
                        },
                    )
                }
            }

            // Pager
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize(),
                userScrollEnabled = true,
            ) { eraIdx ->
                EraPage(
                    eraIdx = eraIdx,
                    era = ERAS[eraIdx],
                    isStoryUnlocked = ::isStoryUnlocked,
                    completedCount = ::completedCount,
                    isCompleted = { sIdx -> completed[storyKey(eraIdx, sIdx)] == true },
                    onBegin = { storyIdx ->
                        activeStory = Pair(eraIdx, storyIdx)
                    },
                    onNextEra = if (eraIdx < ERAS.size - 1) ({
                        scope.launch { pagerState.animateScrollToPage(eraIdx + 1) }
                    }) else null,
                )
            }
        }
    }

    // Story challenge sheet
    activeStory?.let { (eraIdx, storyIdx) ->
        StorySheet(
            eraName = ERAS[eraIdx].name,
            storyTitle = ERAS[eraIdx].stories[storyIdx].title,
            onComplete = {
                completed[storyKey(eraIdx, storyIdx)] = true
                showToast("Story completed! Next story unlocked.")
            },
            onDismiss = { activeStory = null },
        )
    }
}

// ── EraPage ───────────────────────────────────────────────────────────────────

@Composable
private fun EraPage(
    eraIdx: Int,
    era: EraData,
    isStoryUnlocked: (Int, Int) -> Boolean,
    completedCount: (Int) -> Int,
    isCompleted: (Int) -> Boolean,
    onBegin: (Int) -> Unit,
    onNextEra: (() -> Unit)? = null,
) {
    val done = completedCount(eraIdx)
    val eraComplete = done >= STORIES_TO_ADVANCE

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(BgColor),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    era.name,
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    ),
                )
                if (eraComplete) {
                    Text(
                        "Era Complete ✓",
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = Amber,
                        ),
                    )
                } else {
                    Text(
                        "$done / $STORIES_TO_ADVANCE stories to unlock next era",
                        style = MaterialTheme.typography.labelMedium.copy(color = Slate400),
                    )
                    LinearProgressIndicator(
                        progress = { done.toFloat() / STORIES_TO_ADVANCE },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp),
                        color = Amber,
                        trackColor = Color.White.copy(alpha = 0.06f),
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
            }
        }

        itemsIndexed(era.stories) { storyIdx, story ->
            val unlocked = isStoryUnlocked(eraIdx, storyIdx)
            val isDone = isCompleted(storyIdx)
            StoryCard(
                story = story,
                unlocked = unlocked,
                isDone = isDone,
                onBegin = { onBegin(storyIdx) },
            )
        }

        if (eraComplete) {
            item {
                Spacer(modifier = Modifier.height(8.dp))
                if (onNextEra != null) {
                    Button(
                        onClick = { onNextEra() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Amber),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text(
                            "Next Era: ${ERAS[eraIdx + 1].name} →",
                            color = BgColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                        )
                    }
                } else {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("🏆", fontSize = 28.sp)
                        Text(
                            "All Eras Complete!",
                            color = Amber,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                        )
                    }
                }
            }
        }
    }
}

// ── StoryCard ─────────────────────────────────────────────────────────────────

@Composable
private fun StoryCard(
    story: Story,
    unlocked: Boolean,
    isDone: Boolean,
    onBegin: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.dp,
                color = if (unlocked) Amber.copy(alpha = 0.3f) else Color.White.copy(alpha = 0.06f),
                shape = RoundedCornerShape(14.dp),
            )
            .background(
                color = if (unlocked) Color.White.copy(alpha = 0.03f) else Color.White.copy(alpha = 0.02f),
                shape = RoundedCornerShape(14.dp),
            )
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Status icon box
        Surface(
            modifier = Modifier.size(36.dp),
            shape = RoundedCornerShape(10.dp),
            color = when {
                unlocked && isDone -> Amber.copy(alpha = 0.20f)
                unlocked -> Amber.copy(alpha = 0.10f)
                else -> Color.White.copy(alpha = 0.04f)
            },
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = when {
                        !unlocked -> "🔒"
                        isDone -> "✓"
                        else -> "▶"
                    },
                    color = if (unlocked) Amber else Slate700,
                    fontSize = if (unlocked && !isDone) 12.sp else 14.sp,
                )
            }
        }

        // Text content
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                story.title,
                style = MaterialTheme.typography.titleSmall.copy(
                    color = if (unlocked) Color.White else Slate700,
                ),
                maxLines = 2,
            )
            story.figure?.let { fig ->
                Text(
                    fig,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontStyle = FontStyle.Italic,
                        color = if (unlocked) Slate400 else Slate700.copy(alpha = 0.6f),
                    ),
                )
            }
            Text(
                "${story.quizzes} ${if (story.quizzes == 1) "quiz" else "quizzes"}",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 10.sp,
                    color = if (unlocked) Slate700 else Slate700.copy(alpha = 0.5f),
                ),
            )
        }

        // Action
        when {
            unlocked && !isDone -> {
                TextButton(
                    onClick = onBegin,
                    colors = ButtonDefaults.textButtonColors(
                        containerColor = Amber,
                        contentColor = Color(0xFF080812),
                    ),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 7.dp),
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Text("Begin →", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
            isDone -> {
                Text(
                    "Done",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.SemiBold,
                        color = Amber.copy(alpha = 0.6f),
                    ),
                )
            }
        }
    }
}
