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
fun ArcadeScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val allChallenges = remember {
        StoryChallengesLoader.load(context).flatMapIndexed { si, entry ->
            entry.challenges.mapIndexed { ci, dto ->
                FlatChallenge(
                    id = "$si-$ci",
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

    // Play dialog
    playing?.let { ch ->
        ChallengeDialog(ch = ch, onClose = { playing = null })
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

// ── Play dialog ───────────────────────────────────────────────────────────────

@Composable
private fun ChallengeDialog(ch: FlatChallenge, onClose: () -> Unit) {
    var won by remember { mutableStateOf(false) }
    var correct by remember { mutableStateOf<Boolean?>(null) }

    val cat = CATEGORIES.find { it.key == (GAME_CATEGORY[ch.game] ?: "All") } ?: CATEGORIES[0]

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(BgDark),
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Surface1)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .background(cat.color.copy(alpha = 0.15f), CircleShape)
                        .border(1.dp, cat.color.copy(alpha = 0.4f), CircleShape)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Text(GAME_LABEL[ch.game] ?: ch.game ?: "", fontSize = 10.sp,
                        fontWeight = FontWeight.Bold, letterSpacing = 1.sp, color = cat.color)
                }
                Text(ch.storyName, fontSize = 11.sp, color = Slate400, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
                    Text("✕", color = Slate400, fontSize = 16.sp)
                }
            }

            // Challenge body
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                item {
                    when (ch.dto.type) {
                        ChallengeType.quiz -> ArcadeQuiz(ch.dto) { c ->
                            correct = c
                            if (c) won = true
                        }
                        ChallengeType.truefalse -> ArcadeTrueFalse(ch.dto) { c ->
                            correct = c
                            if (c) won = true
                        }
                        ChallengeType.sort -> ArcadeSort(ch.dto) { c ->
                            correct = c
                            if (c) won = true
                        }
                        ChallengeType.minigame -> ArcadeMinigameCard(ch.dto)
                    }
                }

                // Fact
                if (correct != null || won) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    if (correct == true) Green.copy(0.08f) else Red.copy(0.08f),
                                    RoundedCornerShape(12.dp)
                                )
                                .border(
                                    1.dp,
                                    if (correct == true) Green.copy(0.25f) else Red.copy(0.2f),
                                    RoundedCornerShape(12.dp)
                                )
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                if (correct == true) "✓ Correct!" else "Not quite —",
                                color = if (correct == true) Green else Red,
                                fontWeight = FontWeight.Bold, fontSize = 13.sp,
                            )
                            Text(ch.dto.fact, color = Slate400, fontSize = 12.sp, lineHeight = 18.sp)
                        }
                    }
                }
            }

            // Win banner
            if (won) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Green.copy(alpha = 0.08f))
                        .border(width = 0.dp, color = Color.Transparent, shape = RoundedCornerShape(0.dp))
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("✓", color = Green, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("Challenge Complete!", color = Green, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }
                    Button(
                        onClick = onClose,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Green.copy(alpha = 0.2f)),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text("Back to Arcade", color = Green, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

// ── Challenge renderers ───────────────────────────────────────────────────────

@Composable
private fun ArcadeQuiz(ch: ChallengeDTO, onAnswer: (Boolean) -> Unit) {
    var selected by remember { mutableIntStateOf(-1) }
    val answered = selected != -1
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(ch.question ?: "", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        ch.options?.forEachIndexed { i, opt ->
            val isCorrect = i == ch.answer
            val isSelected = i == selected
            val bg = when {
                !answered -> Color.White.copy(alpha = 0.05f)
                isCorrect -> Green.copy(alpha = 0.15f)
                isSelected -> Red.copy(alpha = 0.15f)
                else -> Color.White.copy(alpha = 0.02f)
            }
            val borderColor = when {
                !answered -> Color.White.copy(alpha = 0.1f)
                isCorrect -> Green.copy(alpha = 0.5f)
                isSelected -> Red.copy(alpha = 0.4f)
                else -> Color.White.copy(alpha = 0.04f)
            }
            val textColor = when {
                !answered -> Color.White.copy(alpha = 0.85f)
                isCorrect -> Green
                isSelected -> Red
                else -> Color.White.copy(alpha = 0.3f)
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(bg, RoundedCornerShape(12.dp))
                    .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                    .clickable(enabled = !answered) {
                        selected = i
                        onAnswer(i == ch.answer)
                    }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) { Text(opt, color = textColor, fontSize = 14.sp) }
        }
    }
}

@Composable
private fun ArcadeTrueFalse(ch: ChallengeDTO, onAnswer: (Boolean) -> Unit) {
    var choice by remember { mutableStateOf<Boolean?>(null) }
    val answered = choice != null
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(ch.statement ?: "", color = Color.White, fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp, fontStyle = FontStyle.Italic)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf(true, false).forEach { v ->
                val isCorrect = v == ch.correct
                val isSelected = v == choice
                val bg = when {
                    !answered -> Color.White.copy(alpha = 0.05f)
                    isCorrect -> Green.copy(alpha = 0.15f)
                    isSelected -> Red.copy(alpha = 0.15f)
                    else -> Color.White.copy(alpha = 0.02f)
                }
                val borderColor = when {
                    !answered -> Color.White.copy(alpha = 0.1f)
                    isCorrect -> Green.copy(alpha = 0.5f)
                    isSelected -> Red.copy(alpha = 0.4f)
                    else -> Color.White.copy(alpha = 0.04f)
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .background(bg, RoundedCornerShape(12.dp))
                        .border(1.dp, borderColor, RoundedCornerShape(12.dp))
                        .clickable(enabled = !answered) {
                            choice = v
                            onAnswer(v == ch.correct)
                        }
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (v) "TRUE" else "FALSE",
                        color = when {
                            !answered -> Color.White
                            isCorrect -> Green
                            isSelected -> Red
                            else -> Color.White.copy(0.3f)
                        },
                        fontWeight = FontWeight.Bold, fontSize = 14.sp,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ArcadeSort(ch: ChallengeDTO, onAnswer: (Boolean) -> Unit) {
    val items = ch.items ?: return
    val shuffled = remember { items.shuffled() }
    val selected = remember { mutableStateListOf<String>() }
    var submitted by remember { mutableStateOf(false) }
    val remaining = shuffled.filter { !selected.contains(it) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(ch.question ?: "Arrange in correct order:", color = Color.White,
            fontWeight = FontWeight.SemiBold, fontSize = 14.sp)

        // Answer slots
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White.copy(alpha = 0.03f), RoundedCornerShape(12.dp))
                .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(12.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (selected.isEmpty()) {
                Text("Tap items below in order…", color = Slate600, fontSize = 12.sp, fontStyle = FontStyle.Italic)
            } else {
                selected.forEachIndexed { i, item ->
                    val isCorrect = submitted && i < items.size && item == items[i]
                    val isWrong = submitted && (i >= items.size || item != items[i])
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                when { isCorrect -> Green.copy(0.15f); isWrong -> Red.copy(0.15f); else -> Amber.copy(0.1f) },
                                RoundedCornerShape(8.dp)
                            )
                            .border(1.dp,
                                when { isCorrect -> Green.copy(0.4f); isWrong -> Red.copy(0.35f); else -> Amber.copy(0.25f) },
                                RoundedCornerShape(8.dp))
                            .clickable(enabled = !submitted) { selected.remove(item) }
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("${i + 1}. ", color = Slate400, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text(item,
                            color = when { isCorrect -> Green; isWrong -> Red; else -> Amber },
                            fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }

        // Available chips
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            remaining.forEach { item ->
                Box(
                    modifier = Modifier
                        .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                        .clickable(enabled = !submitted) { selected.add(item) }
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                ) {
                    Text(item, color = Color.White.copy(0.8f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }

        if (selected.size == items.size && !submitted) {
            Button(
                onClick = {
                    submitted = true
                    onAnswer(selected.toList() == items)
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Amber),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Check Order", color = BgDark, fontWeight = FontWeight.Bold)
            }
        }

        if (submitted && selected.toList() != items) {
            TextButton(
                onClick = {
                    submitted = false
                    selected.clear()
                    selected.addAll(shuffled.shuffled())
                    selected.clear()
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Try again", color = Slate400)
            }
        }
    }
}

@Composable
private fun ArcadeMinigameCard(ch: ChallengeDTO) {
    val gameLabel = GAME_LABEL[ch.game] ?: "Challenge"
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Amber.copy(alpha = 0.06f), RoundedCornerShape(16.dp))
            .border(1.dp, Amber.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("✦ $gameLabel", color = Amber, fontSize = 10.sp,
            fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Text(ch.instruction ?: ch.question ?: "Play this challenge in the Epic story mode.",
            color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Text("Open the story in Epic mode to play this interactive challenge.",
            color = Slate400, fontSize = 12.sp, lineHeight = 18.sp)
        Text(ch.fact, color = Slate600, fontSize = 11.sp, lineHeight = 17.sp)
    }
}
