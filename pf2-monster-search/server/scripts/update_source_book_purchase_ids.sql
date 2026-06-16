-- Link pf2.SourceBook.SourcePurchaseID to pf2.SourceBookPurchase by store URL.
-- Generated 2026-06-15T14:20:16.633Z
-- Mapped source books: 142

USE PathfinderUtil;
GO

SET NOCOUNT ON;
GO

IF COL_LENGTH('pf2.SourceBook', 'SourcePurchaseID') IS NULL
BEGIN
    RAISERROR('Run create_source_book_purchase.sql first.', 16, 1);
    RETURN;
END
GO

UPDATE sb
SET sb.SourcePurchaseID = NULL
FROM pf2.SourceBook sb;
GO

UPDATE sb
SET sb.SourcePurchaseID = sbp.SourceBookPurchaseId
FROM pf2.SourceBook sb
INNER JOIN (
    VALUES
        (206, N'https://store.paizo.com/pathfinder-adventure-a-few-flowers-more/'), -- A Few Flowers More
        (99, N'https://store.paizo.com/pathfinder-adventure-path-abomination-vaults/'), -- Abomination Vaults Hardcover
        (85, N'https://store.paizo.com/pathfinder-lost-omens-absalom/'), -- Absalom, City of Lost Omens
        (170, N'https://store.paizo.com/pathfinder-roleplaying-game-advanced-player-s-guide-ogl-pocket-edition/'), -- Advanced Player''s Guide
        (190, N'https://store.paizo.com/pathfinder-lost-omens-ancestry-guide-pdf/'), -- Ancestry Guide
        (60, N'https://store.paizo.com/pathfinder-battlecry/'), -- Battlecry!
        (4, N'https://store.paizo.com/pathfinder-battles-bestiary-unleashed-cacodaemon/'), -- Bestiary
        (3, N'https://store.paizo.com/pathfinder-roleplaying-game-bestiary-2-pfrpg-pocket-edition/'), -- Bestiary 2
        (5, N'https://store.paizo.com/pathfinder-roleplaying-game-bestiary-3-pfrpg-pocket-edition/'), -- Bestiary 3
        (91, N'https://store.paizo.com/pathfinder-book-of-the-dead/'), -- Book of the Dead
        (109, N'https://store.paizo.com/pathfinder-lost-omens-character-guide/'), -- Character Guide
        (107, N'https://store.paizo.com/pathfinder-adventure-claws-of-the-tyrant/'), -- Claws of the Tyrant
        (197, N'https://store.paizo.com/pathfinder-adventure-path-151-the-show-must-go-on-extinction-curse-1-of-6-p2/'), -- Come One, Come All, to the Extinction Curse Player''s Guide!
        (138, N'https://store.paizo.com/pathfinder-rpg-core-rulebook-ogl-pocket-edition/'), -- Core Rulebook
        (40, N'https://store.paizo.com/pathfinder-adventure-crown-of-the-kobold-king-anniversary-edition-p2/'), -- Crown of the Kobold King
        (129, N'https://store.paizo.com/pathfinder-dark-archive-remastered/'), -- Dark Archive
        (169, N'https://store.paizo.com/pathfinder-lost-omens-divine-mysteries/'), -- Divine Mysteries
        (16, N'https://store.paizo.com/pathfinder-lost-omens-draconic-codex/'), -- Draconic Codex
        (174, N'https://store.paizo.com/pathfinder-lost-omens-firebrands/'), -- Firebrands
        (198, N'https://store.paizo.com/pathfinder-fists-of-the-ruby-phoenix-adventure-path-p2/'), -- Fists of the Ruby Phoenix Hardcover
        (15, N'https://store.paizo.com/pathfinder-1000-piece-puzzle-gamemastery-guide/'), -- Gamemastery Guide
        (199, N'https://store.paizo.com/pathfinder-book-tabs-gm-core/'), -- GM Core
        (176, N'https://store.paizo.com/pathfinder-lost-omens-gods-magic/'), -- Gods & Magic
        (127, N'https://store.paizo.com/pathfinder-lost-omens-grand-bazaar/'), -- Grand Bazaar
        (192, N'https://store.paizo.com/pathfinder-guns-gears/'), -- Guns & Gears
        (191, N'https://store.paizo.com/pathfinder-guns-gears-remastered/'), -- Guns & Gears (Remastered)
        (102, N'https://store.paizo.com/pathfinder-lost-omens-hellfire-dispatches/'), -- Hellfire Dispatches
        (74, N'https://store.paizo.com/pathfinder-lost-omens-highhelm/'), -- Highhelm
        (43, N'https://store.paizo.com/pathfinder-howl-of-the-wild/'), -- Howl of the Wild
        (93, N'https://store.paizo.com/pathfinder-battles-impossible-lands-impossible-foes-boxed-set/'), -- Impossible Lands
        (20, N'https://store.paizo.com/pathfinder-kingmaker-adventure-path-p2/'), -- Kingmaker Adventure Path
        (53, N'https://store.paizo.com/pathfinder-kingmaker-companion-guide-special-edition-p2/'), -- Kingmaker Companion Guide
        (186, N'https://store.paizo.com/pathfinder-lost-omens-knights-of-lastwall/'), -- Knights of Lastwall
        (175, N'https://store.paizo.com/pathfinder-battles-legends-of-golarion-akata/'), -- Legends
        (41, N'https://store.paizo.com/pathfinder-flip-mat-malevolence/'), -- Malevolence
        (2, N'https://store.paizo.com/pathfinder-monster-core/'), -- Monster Core
        (11, N'https://store.paizo.com/pathfinder-monster-core-2/'), -- Monster Core 2
        (30, N'https://store.paizo.com/pathfinder-lost-omens-monsters-of-myth/'), -- Monsters of Myth
        (108, N'https://store.paizo.com/pathfinder-adventure-night-of-the-gray-death/'), -- Night of the Gray Death
        (7, N'https://store.paizo.com/pathfinder-npc-core/'), -- NPC Core
        (38, N'https://store.paizo.com/pathfinder-adventure-path-hellknight-hill-age-of-ashes-1-of-6-pdf/'), -- Pathfinder #145: Hellknight Hill
        (71, N'https://store.paizo.com/pathfinder-adventure-path-146-cult-of-cinders-age-of-ashes-2-of-6-p2/'), -- Pathfinder #146: Cult of Cinders
        (75, N'https://store.paizo.com/pathfinder-adventure-path-147-tomorrow-must-burn-age-of-ashes-3-of-6-p2/'), -- Pathfinder #147: Tomorrow Must Burn
        (14, N'https://store.paizo.com/pathfinder-adventure-path-148-fires-of-the-haunted-city-age-of-ashes-4-of-6-p2/'), -- Pathfinder #148: Fires of the Haunted City
        (48, N'https://store.paizo.com/pathfinder-adventure-path-149-against-the-scarlet-triad-age-of-ashes-5-of-6-pdf/'), -- Pathfinder #149: Against the Scarlet Triad
        (33, N'https://store.paizo.com/pathfinder-adventure-path-150-broken-promises-age-of-ashes-6-of-6-p2/'), -- Pathfinder #150: Broken Promises
        (6, N'https://store.paizo.com/pathfinder-adventure-path-151-the-show-must-go-on-extinction-curse-1-of-6-p2/'), -- Pathfinder #151: The Show Must Go On
        (18, N'https://store.paizo.com/pathfinder-adventure-path-152-legacy-of-the-lost-god-extinction-curse-2-of-6-p2/'), -- Pathfinder #152: Legacy of the Lost God
        (94, N'https://store.paizo.com/pathfinder-adventure-path-153-lifes-long-shadows-extinction-curse-3-of-6-p2/'), -- Pathfinder #153: Life''s Long Shadows
        (70, N'https://store.paizo.com/pathfinder-adventure-path-154-siege-of-the-dinosaurs-extinction-curse-4-of-6-p2/'), -- Pathfinder #154: Siege of the Dinosaurs
        (54, N'https://store.paizo.com/pathfinder-adventure-path-155-lord-of-the-black-sands-extinction-curse-5-of-6-p2/'), -- Pathfinder #155: Lord of the Black Sands
        (89, N'https://store.paizo.com/pathfinder-adventure-path-156-the-apocalypse-prophet-extinction-curse-6-of-6-p2/'), -- Pathfinder #156: The Apocalypse Prophet
        (47, N'https://store.paizo.com/pathfinder-adventure-path-157-devil-at-the-dreaming-palace-agents-of-edgewatch-1-of-6-pdf/'), -- Pathfinder #157: Devil at the Dreaming Palace
        (101, N'https://store.paizo.com/pathfinder-adventure-path-158-sixty-feet-under-agents-of-edgewatch-2-of-6-p2/'), -- Pathfinder #158: Sixty Feet Under
        (81, N'https://store.paizo.com/pathfinder-adventure-path-159-all-or-nothing-agents-of-edgewatch-3-of-6-p2/'), -- Pathfinder #159: All or Nothing
        (113, N'https://store.paizo.com/pathfinder-adventure-path-160-assault-on-hunting-lodge-seven-agents-of-edgewatch-4-of-6-p2/'), -- Pathfinder #160: Assault on Hunting Lodge Seven
        (112, N'https://store.paizo.com/pathfinder-adventure-path-161-belly-of-the-black-whale-agents-of-edgewatch-5-of-6-p2/'), -- Pathfinder #161: Belly of the Black Whale
        (26, N'https://store.paizo.com/pathfinder-adventure-path-162-ruins-of-the-radiant-siege-agents-of-edgewatch-6-of-6-p2/'), -- Pathfinder #162: Ruins of the Radiant Siege
        (46, N'https://store.paizo.com/pathfinder-adventure-path-163-ruins-of-gauntlight-abomination-vaults-1-of-3-pdf/'), -- Pathfinder #163: Ruins of Gauntlight
        (106, N'https://store.paizo.com/pathfinder-adventure-path-164-hands-of-the-devil-abomination-vaults-2-of-3-p2/'), -- Pathfinder #164: Hands of the Devil
        (92, N'https://store.paizo.com/pathfinder-adventure-path-165-eyes-of-empty-death-abomination-vaults-3-of-3-pdf/'), -- Pathfinder #165: Eyes of Empty Death
        (25, N'https://store.paizo.com/pathfinder-adventure-path-166-despair-on-danger-island-fists-of-the-ruby-phoenix-1-of-3-p2/'), -- Pathfinder #166: Despair on Danger Island
        (36, N'https://store.paizo.com/pathfinder-adventure-path-167-ready-fight-fists-of-the-ruby-phoenix-2-of-3-pdf/'), -- Pathfinder #167: Ready? Fight!
        (8, N'https://store.paizo.com/pathfinder-adventure-path-168-king-of-the-mountain-fists-of-the-ruby-phoenix-3-of-3-p2/'), -- Pathfinder #168: King of the Mountain
        (56, N'https://store.paizo.com/pathfinder-adventure-path-169-kindled-magic-strength-of-thousands-1-of-6-p2/'), -- Pathfinder #169: Kindled Magic
        (118, N'https://store.paizo.com/pathfinder-adventure-path-170-spoken-on-the-song-wind-strength-of-thousands-2-of-6-pdf/'), -- Pathfinder #170: Spoken on the Song Wind
        (9, N'https://store.paizo.com/pathfinder-adventure-path-171-hurricanes-howl-strength-of-thousands-3-of-6-pdf/'), -- Pathfinder #171: Hurricane''s Howl
        (82, N'https://store.paizo.com/pathfinder-adventure-path-172-secrets-of-the-temple-city-strength-of-thousands-4-of-6-pdf/'), -- Pathfinder #172: Secrets of the Temple City
        (58, N'https://store.paizo.com/pathfinder-adventure-path-173-doorway-to-the-red-star-strength-of-thousands-5-of-6-pdf/'), -- Pathfinder #173: Doorway to the Red Star
        (39, N'https://store.paizo.com/pathfinder-adventure-path-174-shadows-of-the-ancients-strength-of-thousands-6-of-6-p2/'), -- Pathfinder #174: Shadows of the Ancients
        (63, N'https://store.paizo.com/pathfinder-adventure-path-175-broken-tusk-moon-quest-for-the-frozen-flame-1-of-3-p2/'), -- Pathfinder #175: Broken Tusk Moon
        (72, N'https://store.paizo.com/pathfinder-adventure-path-176-lost-mammoth-valley-quest-for-the-frozen-flame-2-of-3-p2/'), -- Pathfinder #176: Lost Mammoth Valley
        (67, N'https://store.paizo.com/pathfinder-adventure-path-177-burning-tundra-quest-for-the-frozen-flame-3-of-3-p2/'), -- Pathfinder #177: Burning Tundra
        (115, N'https://store.paizo.com/pathfinder-adventure-path-178-punks-in-a-powderkeg-outlaws-of-alkenstar-1-of-3-p2/'), -- Pathfinder #178: Punks in a Powderkeg
        (1, N'https://store.paizo.com/pathfinder-adventure-path-179-cradle-of-quartz-outlaws-of-alkenstar-2-of-3-p2/'), -- Pathfinder #179: Cradle of Quartz
        (65, N'https://store.paizo.com/pathfinder-adventure-path-180-the-smoking-gun-outlaws-of-alkenstar-3-of-3-p2/'), -- Pathfinder #180: The Smoking Gun
        (100, N'https://store.paizo.com/pathfinder-adventure-path-181-zombie-feast-blood-lords-1-of-6-p2/'), -- Pathfinder #181: Zombie Feast
        (64, N'https://store.paizo.com/pathfinder-adventure-path-182-graveclaw-blood-lords-2-of-6-p2/'), -- Pathfinder #182: Graveclaw
        (21, N'https://store.paizo.com/pathfinder-adventure-path-183-field-of-maidens-blood-lords-3-of-6-p2/'), -- Pathfinder #183: Field of Maidens
        (59, N'https://store.paizo.com/pathfinder-adventure-path-184-the-ghouls-hunger-blood-lords-4-of-6-p2/'), -- Pathfinder #184: The Ghouls Hunger
        (23, N'https://store.paizo.com/pathfinder-adventure-path-185-a-taste-of-ashes-blood-lords-5-of-6-p2/'), -- Pathfinder #185: A Taste of Ashes
        (90, N'https://store.paizo.com/pathfinder-adventure-path-186-ghost-kings-rage-blood-lords-6-of-6-p2/'), -- Pathfinder #186: Ghost King''s Rage
        (52, N'https://store.paizo.com/pathfinder-adventure-path-187-the-seventh-arch-gatewalkers-1-of-3-pdf/'), -- Pathfinder #187: The Seventh Arch
        (66, N'https://store.paizo.com/pathfinder-adventure-path-188-they-watched-the-stars-gatewalkers-2-of-3-p2/'), -- Pathfinder #188: They Watched the Stars
        (31, N'https://store.paizo.com/pathfinder-adventure-path-189-dreamers-of-the-nameless-spires-gatewalkers-3-of-3-p2/'), -- Pathfinder #189: Dreamers of the Nameless Spires
        (69, N'https://store.paizo.com/pathfinder-adventure-path-190-the-choosing-stolen-fate-1-of-3-p2/'), -- Pathfinder #190: The Choosing
        (45, N'https://store.paizo.com/pathfinder-adventure-path-191-the-destiny-war-stolen-fate-2-of-3-p2/'), -- Pathfinder #191: The Destiny War
        (98, N'https://store.paizo.com/pathfinder-adventure-path-192-the-worst-of-all-possible-worlds-stolen-fate-3-of-3-p2/'), -- Pathfinder #192: Worst of All Possible Worlds
        (57, N'https://store.paizo.com/pathfinder-adventure-path-193-mantle-of-gold-sky-kings-tomb-1-of-3-p2/'), -- Pathfinder #193: Mantle of Gold
        (96, N'https://store.paizo.com/pathfinder-adventure-path-194-cult-of-the-cave-worm-sky-kings-tomb-2-of-3-p2/'), -- Pathfinder #194: Cult of the Cave Worm
        (73, N'https://store.paizo.com/pathfinder-adventure-path-195-heavy-is-the-crown-sky-kings-tomb-3-of-3-p2/'), -- Pathfinder #195: Heavy is the Crown
        (88, N'https://store.paizo.com/pathfinder-adventure-path-196-the-summer-that-never-was-season-of-ghosts-1-of-4-p2/'), -- Pathfinder #196: The Summer That Never Was
        (87, N'https://store.paizo.com/pathfinder-adventure-path-197-let-the-leaves-fall-season-of-ghosts-2-of-4-p2/'), -- Pathfinder #197: Let the Leaves Fall
        (34, N'https://store.paizo.com/pathfinder-adventure-path-198-no-breath-to-cry-season-of-ghosts-3-of-4-p2/'), -- Pathfinder #198: No Breath to Cry
        (42, N'https://store.paizo.com/pathfinder-adventure-path-199-to-bloom-below-the-web-season-of-ghosts-4-of-4-p2/'), -- Pathfinder #199: To Bloom Below the Web
        (12, N'https://store.paizo.com/pathfinder-adventure-path-200-seven-dooms-for-sandpoint-foundry-vtt-code/'), -- Pathfinder #200: Seven Dooms for Sandpoint
        (49, N'https://store.paizo.com/pathfinder-adventure-path-201-pactbreaker-wardens-of-wildwood-1-of-3-p2/'), -- Pathfinder #201: Pactbreaker
        (83, N'https://store.paizo.com/pathfinder-adventure-path-202-severed-at-the-root-wardens-of-wildwood-2-of-3-p2/'), -- Pathfinder #202: Severed at the Root
        (68, N'https://store.paizo.com/pathfinder-adventure-path-203-shepherd-of-decay-wardens-of-wildwood-3-of-3-p2/'), -- Pathfinder #203 Shepherd of Decay
        (61, N'https://store.paizo.com/pathfinder-adventure-path-204-stage-fright-curtain-call-1-of-3-p2/'), -- Pathfinder #204: Stage Fright
        (24, N'https://store.paizo.com/pathfinder-adventure-path-205-singer-stalker-skinsaw-man-curtain-call-2-of-3-p2/'), -- Pathfinder #205: Singer, Stalker, Skinsaw Man
        (123, N'https://store.paizo.com/pathfinder-adventure-path-206-bring-the-house-down-curtain-call-3-of-3-pdf/'), -- Pathfinder #206: Bring the House Down
        (76, N'https://store.paizo.com/pathfinder-adventure-path-207-resurrection-flood-triumph-of-the-tusk-1-of-3-p2/'), -- Pathfinder #207: Resurrection Flood
        (77, N'https://store.paizo.com/pathfinder-adventure-path-208-hoof-cinder-and-storm-triumph-of-the-tusk-2-of-3-p2/'), -- Pathfinder #208: Hoof, Cinder, and Storm
        (105, N'https://store.paizo.com/pathfinder-adventure-path-209-destroyers-doom-triumph-of-the-tusk-3-of-3-p2/'), -- Pathfinder #209: Destroyer''s Doom
        (119, N'https://store.paizo.com/pathfinder-adventure-path-210-whispers-in-the-dirt-spore-war-1-of-3-p2/'), -- Pathfinder #210: Whispers in the Dirt
        (103, N'https://store.paizo.com/pathfinder-adventure-path-211-secret-of-deathstalk-tower-spore-war-2-of-3-p2/'), -- Pathfinder #211: The Secret of Deathstalk Tower
        (117, N'https://store.paizo.com/pathfinder-adventure-path-212-the-voice-in-the-blight-spore-war-3-of-3-p2/'), -- Pathfinder #212: A Voice in the Blight
        (50, N'https://store.paizo.com/pathfinder-adventure-path-213-thirst-for-blood-shades-of-blood-1-of-3-p2/'), -- Pathfinder #213: Thirst for Blood
        (80, N'https://store.paizo.com/pathfinder-adventure-path-214-the-broken-palace-shades-of-blood-2-of-3-p2/'), -- Pathfinder #214: The Broken Palace
        (22, N'https://store.paizo.com/pathfinder-adventure-path-215-to-blot-out-the-sun-shades-of-blood-3-of-3-p2/'), -- Pathfinder #215: To Blot Out the Sun
        (104, N'https://store.paizo.com/pathfinder-adventure-path-216-the-acropolis-pyre-myth-speaker-1-of-3-p2/'), -- Pathfinder #216: The Acropolis Pyre
        (55, N'https://store.paizo.com/pathfinder-adventure-path-217-death-sails-a-wine-dark-sea-myth-speaker-2-of-3-p2/'), -- Pathfinder #217: Death Sails a Wine-Dark Sea
        (37, N'https://store.paizo.com/pathfinder-adventure-path-218-titanbane-myth-speaker-3-of-3-p2/'), -- Pathfinder #218: Titanbane
        (84, N'https://store.paizo.com/pathfinder-adventure-path-219-lord-of-the-trinity-star-revenge-of-the-runelords-1-of-3-p2/'), -- Pathfinder Adventure Path #219: Lord of the Trinity Star
        (207, N'https://store.paizo.com/pathfinder-beginner-box-secrets-of-the-unlit-star/'), -- Pathfinder Beginner Box: Game Master''s Guide
        (97, N'https://store.paizo.com/pathfinder-game-night-dawn-of-the-frogs/'), -- Pathfinder Game Night: Dawn of the Frogs (Deluxe Adventure)
        (204, N'https://store.paizo.com/pfs-scenario-1-24-lightning-strikes-stars-fall/'), -- PFS Scenario #1-24: Lightning Strikes, Stars Fall
        (136, N'https://store.paizo.com/pathfinder-player-core-2/'), -- Player Core
        (168, N'https://store.paizo.com/pathfinder-player-core-2/'), -- Player Core 2
        (44, N'https://store.paizo.com/pathfinder-adventure-prey-for-death/'), -- Prey for Death
        (13, N'https://store.paizo.com/pathfinder-rage-of-elements/'), -- Rage of Elements
        (173, N'https://store.paizo.com/pathfinder-lost-omens-rival-academies/'), -- Rival Academies
        (114, N'https://store.paizo.com/pathfinder-flip-mat-rusthenge-p2/'), -- Rusthenge
        (35, N'https://store.paizo.com/pathfinder-adventure-path-season-of-ghosts/'), -- Season of Ghosts (Hardcover)
        (167, N'https://store.paizo.com/pathfinder-rpg-secrets-of-magic-spell-cards/'), -- Secrets of Magic
        (209, N'https://store.paizo.com/pathfinder-beginner-box-secrets-of-the-unlit-star/'), -- Secrets of the Unlit Star Game Master''s Guide
        (10, N'https://store.paizo.com/pathfinder-adventure-shadows-at-sundown/'), -- Shadows at Sundown
        (78, N'https://store.paizo.com/pathfinder-lost-omens-shining-kingdoms-poster-map-archive/'), -- Shining Kingdoms
        (51, N'https://store.paizo.com/pathfinder-adventure-the-enmity-cycle-p2/'), -- The Enmity Cycle
        (95, N'https://store.paizo.com/pathfinder-adventure-the-fall-of-plaguestone-pdf/'), -- The Fall of Plaguestone
        (29, N'https://store.paizo.com/pathfinder-battles-the-mwangi-expanse-lioness/'), -- The Mwangi Expanse
        (28, N'https://store.paizo.com/pathfinder-adventure-the-slithering/'), -- The Slithering
        (181, N'https://store.paizo.com/pathfinder-lost-omens-tian-xia-character-guide-p2/'), -- Tian Xia Character Guide
        (62, N'https://store.paizo.com/pathfinder-lost-omens-tian-xia-world-guide-p2/'), -- Tian Xia World Guide
        (86, N'https://store.paizo.com/pathfinder-lost-omens-travel-guide/'), -- Travel Guide
        (172, N'https://store.paizo.com/pathfinder-treasure-vault/'), -- Treasure Vault
        (171, N'https://store.paizo.com/treasure-vault-remastered/'), -- Treasure Vault (Remastered)
        (79, N'https://store.paizo.com/pathfinder-adventure-troubles-in-grayce/'), -- Troubles in Grayce
        (132, N'https://store.paizo.com/pathfinder-flip-mat-troubles-in-otari-pdf/'), -- Troubles in Otari
        (27, N'https://store.paizo.com/pathfinder-war-of-immortals/'), -- War of Immortals
        (183, N'https://store.paizo.com/pathfinder-chronicles-campaign-setting-world-guide-the-inner-sea/') -- World Guide
) AS v(SourceBookId, StoreUrl)
  ON v.SourceBookId = sb.SourceBookId
INNER JOIN pf2.SourceBookPurchase sbp
  ON sbp.StoreUrl = v.StoreUrl;
GO

SELECT
    sb.SourceBookId,
    sb.Name AS SourceBookName,
    sb.SourcePurchaseID,
    sbp.Name AS PurchaseName,
    sbp.StoreUrl,
    sbp.Price
FROM pf2.SourceBook sb
LEFT JOIN pf2.SourceBookPurchase sbp
  ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
ORDER BY sb.Name;
GO

SELECT
    COUNT(*) AS TotalSourceBooks,
    SUM(CASE WHEN SourcePurchaseID IS NOT NULL THEN 1 ELSE 0 END) AS LinkedSourceBooks,
    SUM(CASE WHEN SourcePurchaseID IS NULL THEN 1 ELSE 0 END) AS UnlinkedSourceBooks
FROM pf2.SourceBook;
GO
