package com.greatpeople.card.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.greatpeople.card.data.ChallengeDTO
import com.greatpeople.card.data.ChallengeType
import com.greatpeople.card.data.StoryChallengesLoader

// ── Palette ───────────────────────────────────────────────────────────────────

private val BgDark   = Color(0xFF080812)
private val Surface1 = Color(0xFF0F0F1E)
private val Amber    = Color(0xFFF59E0B)
private val Slate400 = Color(0xFF94A3B8)
private val Slate600 = Color(0xFF475569)
private val Green    = Color(0xFF34D399)
private val Red      = Color(0xFFF87171)

// ── Category model ────────────────────────────────────────────────────────────

private data class Category(
    val key: String,
    val label: String,
    val icon: String,
    val color: Color,
)

private val CATEGORIES = listOf(
    Category("All",      "All",      "◈", Slate400),
    Category("Trivia",   "Trivia",   "?", Color(0xFFF59E0B)),
    Category("Puzzle",   "Puzzle",   "◻", Color(0xFF06B6D4)),
    Category("Creative", "Creative", "✿", Color(0xFF10B981)),
    Category("Story",    "Story",    "✦", Color(0xFF8B5CF6)),
    Category("Explore",  "Explore",  "◎", Color(0xFFEF4444)),
)

private val GAME_CATEGORY = mapOf(
    "quiz" to "Trivia", "truefalse" to "Trivia",
    "mirror" to "Puzzle", "sudoku" to "Puzzle", "circuit" to "Puzzle",
    "geometry" to "Puzzle", "chemistry" to "Puzzle", "classify" to "Puzzle",
    "crossword" to "Puzzle", "matchthree" to "Puzzle",
    "painting" to "Creative", "cooking" to "Creative", "music" to "Creative",
    "fiction" to "Story", "voting" to "Story", "sort" to "Story", "tactics" to "Story",
    "maze" to "Explore",
)

private val GAME_LABEL = mapOf(
    "quiz" to "Quiz", "truefalse" to "True / False", "sort" to "Sort",
    "maze" to "Maze", "mirror" to "Mirror",
    "circuit" to "Circuit", "crossword" to "Crossword", "geometry" to "Geometry",
    "painting" to "Painting", "music" to "Music", "tactics" to "Tactics",
    "classify" to "Classify", "cooking" to "Cooking", "fiction" to "Fiction",
    "sudoku" to "Sudoku", "voting" to "Voting", "chemistry" to "Chemistry",
    "matchthree" to "Match Three",
)

// ── Flat challenge ─────────────────────────────────────────────────────────────

private data class FlatChallenge(
    val id: String,
    val game: String,        // quiz / truefalse / sort / music / sudoku …
    val storyName: String,
    val era: String,
    val instruction: String, // card preview text
    val dto: ChallengeDTO,
)

private fun gameKey(dto: ChallengeDTO): String =
    dto.game ?: dto.type.name

private fun instructionFor(dto: ChallengeDTO): String =
    dto.instruction ?: dto.question ?: dto.statement ?: "Explore this challenge"

// ── Main screen ───────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArcadeScreen(onBack: () -> Unit, onPlayChallenge: (id: String) -> Unit = {}) {
    val context = LocalContext.current
    val allChallenges = remember {
        StoryChallengesLoader.load(context).flatMapIndexed { si, entry ->
            entry.challenges.mapIndexed { ci, dto ->
                FlatChallenge(
                    id = dto.id ?: "$si-$ci",
                    game = gameKey(dto),
                    storyName = entry.story,
                    era = entry.era,
                    instruction = instructionFor(dto),
                    dto = dto,
                )
            }
        }
    }

    var activeCategory by remember { mutableStateOf("All") }
    var playing by remember { mutableStateOf<FlatChallenge?>(null) }

    val filtered = remember(activeCategory, allChallenges) {
        if (activeCategory == "All") allChallenges
        else allChallenges.filter { GAME_CATEGORY[it.game] == activeCategory }
    }

    val counts = remember(allChallenges) {
        val m = mutableMapOf("All" to allChallenges.size)
        for (ch in allChallenges) {
            val cat = GAME_CATEGORY[ch.game] ?: continue
            m[cat] = (m[cat] ?: 0) + 1
        }
        m
    }

    Scaffold(
        containerColor = BgDark,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("ARCADE", color = Color.White, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                        Text("${allChallenges.size} mini challenges · play any, anytime",
                            style = MaterialTheme.typography.labelSmall, color = Slate400)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BgDark),
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {

            // Category chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CATEGORIES.forEach { cat ->
                    val active = activeCategory == cat.key
                    val count = counts[cat.key] ?: 0
                    val chipBg = if (active) cat.color.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.04f)
                    val chipBorder = if (active) cat.color.copy(alpha = 0.6f) else Color.White.copy(alpha = 0.1f)
                    val textColor = if (active) cat.color else Slate400
                    Row(
                        modifier = Modifier
                            .background(chipBg, CircleShape)
                            .border(1.dp, chipBorder, CircleShape)
                            .clickable { activeCategory = cat.key }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(cat.icon, fontSize = 12.sp, color = textColor)
                        Text(cat.label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = textColor)
                        Text("$count", fontSize = 10.sp, color = textColor.copy(alpha = 0.6f))
                    }
                }
            }

            Divider(color = Color.White.copy(alpha = 0.06f))

            // Challenge list
            LazyColumn(
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(filtered, key = { it.id }) { ch ->
                    ChallengeCard(ch) { playing = ch }
                }
            }
        }
    }

    // Challenges play in the web app (GamePlayerScreen).
    LaunchedEffect(playing) {
        playing?.let { ch -> playing = null; onPlayChallenge(ch.id) }
    }
}

// ── Challenge card ─────────────────────────────────────────────────────────────

@Composable
private fun ChallengeCard(ch: FlatChallenge, onClick: () -> Unit) {
    val cat = CATEGORIES.find { it.key == (GAME_CATEGORY[ch.game] ?: "All") } ?: CATEGORIES[0]
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.03f), RoundedCornerShape(16.dp))
            .border(1.dp, Color.White.copy(alpha = 0.07f), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Category icon dot
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(cat.color.copy(alpha = 0.15f), RoundedCornerShape(10.dp))
                .border(1.dp, cat.color.copy(alpha = 0.3f), RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(cat.icon, fontSize = 16.sp, color = cat.color)
        }

        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    GAME_LABEL[ch.game] ?: ch.game,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = cat.color,
                )
                Text("·", fontSize = 9.sp, color = Slate600)
                Text(ch.era, fontSize = 9.sp, color = Slate600)
            }
            Text(ch.instruction, fontSize = 13.sp, color = Color.White.copy(alpha = 0.85f),
                fontWeight = FontWeight.SemiBold, maxLines = 2,
                lineHeight = 18.sp)
            Text(ch.storyName, fontSize = 10.sp, color = Slate600)
        }

        Text("→", fontSize = 16.sp, color = Amber.copy(alpha = 0.6f))
    }
}
