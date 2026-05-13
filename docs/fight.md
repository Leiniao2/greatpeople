The battle has 2 mode, scenario mode (usually has to be completed in epic tab); the generic mode could be done any time in the battle tab.

The battle supported Player vs Player up to 5 people and Player vs Computer also up to 5 people.

# Game rule

## 1. Game Setup.

Game could be configured All era or Single era. The All era game locations card and great people card are distributed without era limitation.

Each battle starts with 4 Great People card, 2 Event cards, and 8 Follower cards distributed to each player. All cards are started as hand cards.

All Locations cards will be revealed at the begining of the game round and set on table.

The board will look like a table, with column displayed as different locations. rows displayed as different players.

## 2. Game Objective.

Each Great People card will do some achievement, if he/she satisifies the achievement, player will get a winning point. At the end of the game, player with the highest winning points will win.

## 3. Turn based action.

Each Player could do several actions in a turn.

### A. A Player could bring a Great People Card on board, allocate it to a location.
### B. A Player could add a Follower to a location that already has Great People on.
### C. A Player could move a Great People Card / Follower Card from a location to another.
### D. A Player could start an event on the location he/she is on. Some event is global but most are local only happens on the location.
### E. A Player could retrieve a Great People Card / Follower card back to hand.
### F. A Player could claim one of the Great People on board completed his/her achievement, thus get 1 winning point.
### G. A Player could attack the other Player if both some of their cards are within the same location, this only happened in local events.
### H. A Player could end a local event that happening on this city 
### I. A Player could update the public or private status of a card

Each Player could do only 1 time A and 1 time B each turn, but can do any number of C, D, E, F or I (though each Great People and Follower only 1 time). 
Also if a Great People or Follower just get on board, he/she cannot do C/D/E/F/I.
Each Player could do G any times.
A round is each player play 1 turn.

## 4. Card private or public.

When a card is onboard, he/she could be in private or public status. In public it is face on, in private it is face down. 
When face down, other player cannot know what this card is.
After an attack happened, both player's card in this location must be revealed as public.
When a card is bring to the board, he/she could decide if it initialized as public or private.

## 5. Scenarios.

Each stat has 3 different scenarios, the 1st is local conflict, the 2nd is local survival, the 3rd is global competition

### politics: coup, Terrorist Attack, international conference
### strength: battlefield, riot, olympics
### culture: art critique, censorship, roadshow
### wealth: businese war, Depression, auction
### technique: Tech Race, Sanctions, World Fair
### intelligence: Argument, puzzle, Expedition
### belief: Miracle, Inquisition, pilgrimage
### reputation: Lawsuit, Scandal, Celebration

Special: natural hazard (has several different types: flood, blizzard, storm, earthquake, fire, tsunami, pandemic, drought)

Local Event: Only work in this location, if a card is stronger in this dimension than the other, they could attack the other. The winner(some times the defender) will decide if they would like to kill the loser: 
If killed, the card will be sent to discard pile; if not, the losing card will be forced to be retrived to the Player owns them.  
If there is a draw, then nothing happens.
Note: in a challenge, we should compute the total points of all the Great People and Followers in the same location. 
For example if player A has 2 Great People cards and 2 Followers in a art critique scenario, the total should be GP1's culture + GP2's culture + any follower bonus.

Local Survival: Any player in this location with corresponding point (all GP and followers together) less than 10 will be killed and moved to discard pile.

Special Survival: Any player in this location with total point (all GP and followers together) less than 100 will be killed and moved to discard pile.

Special Survival is random happened, not bring onboard by player. 
In real card game, when someone get a scenario card from supply deck he/she has to place it in a location that he/she has most cards in (if there is a tie then it is the first location).
But in programmable game, this random decision is just done by the computer.
Special Survival always last 1 round.

Global Competition: All players involved in this. These scenario always last for 1 round.
By the end of this round, whoever player has the highest total value of the stat (for the specific stat, culture e.g.) over the board (that are public)
The strongest of the Global Competition will get the bonus of event cards (2), follower cards (4), or GP card (1) to his/her hand.

The Scenario card will keep working until it is replaced by another event or some GP end it. 

## 6. Getting new Great People card

Besided getting new card by winning global competition, there are other mechanisms to get new Great people card.
When a Great People completed his/her achievement, he/she could choose to be archived to the archive folder at any time (must be in public when archived).
Once a Great People get archived, the player who owns it could get a new Great People card.

## 7. Turn Order

Great Person Onboard: Deploy a Great Person to the field.

Follower Onboard: Deploy Followers to the field.

Manual Retrieve: Any card may be retrieved by player from board.

Relocation: Any card may move to a different location.

Change Private/Public Status: Any card may change from private to public or vise versa.

Attack: Execute attacks using Great Person cards. To conduct attack, the GP card has to be public, besides any public Followers and GP belong to the same Player will also automatically join the attack. The defense side will automatically have all its card at the same location revealed as public.

Survival Resolution: Calculate the outcomes of Survival scenarios.

Event Resolution: Calculate the outcomes of Event scenarios.

Manual Scenario Termination: A Great Person can end a scenario if they possess the matching Identity (e.g., an Artist can terminate "Cultural Criticism").

Initiate New Scenario: Players could start a new scenario if he/she has the scenario card.

Achievement Check: Determine if a Great Person has completed an achievement to earn Winning Points.

Archive: Great Persons who have completed their achievements are Archived and leave the field.

## 8. When to End a game

If there is a player that gets 5 winning points, the game ends.

(Rarely happens) If there is only 1 player left with GP card (either on hand or on board), the game ends.

