deck {
    agent {
        count = 2
        name = "Crazy President"
        flavorText = "Peripeteia"
        onPlaying { eachPlayer { flipStation { self } } }
        cardCost = listOf()
    }
    agent {
        count = 2
        name = "Double Agent"
        flavorText = "A frenemy of your frenemy is your frenemy"
        onPlaying { neighborsOfTarget { flipStation { self } } }
        cardCost = listOf(blue, yellow)
    }
    agent {
        count = 2
        name = "Hacker Pirate"
        flavorText = "\"I do not fear computers, I fear the lack of them.\" —Isaac Asimov"
        onPlaying {
            chooseOne {
                flipStation { self }
                stealModule { "Satellite" }
                stealModule { "Rover" }
            }
        }
        cardCost = listOf(red, red, yellow, yellow)
    }
    agent {
        count = 2
        name = "Investor"
        flavorText = "\"Never invest in a business you can't understand.\" —Warren Buffet"
        onPlaying { resell { 1 }; flipStation { 1 } }
        cardCost = listOf(blue, yellow, red)
    }
    agent {
        count = 2
        name = "Kim the Mech Pilot"
        flavorText = "Her name is common but her ride is unique"
        onPlaying { draw { 2 }; build { 1 } }
        cardCost = listOf(red, red, red, red, red)
    }
    agent {
        count = 2
        name = "Market Manipulator"
        flavorText = "I am a shark, the stock exchange is my ocean, and most people can't even swim"
        onPlaying { resell { 2 }; opponent { resell { 2 } }; stealCredits { 3 } }
        cardCost = listOf(yellow, yellow, yellow, yellow, yellow)
    }
    agent {
        count = 2
        name = "Mormon Scientist"
        flavorText = "Is the moon ready for a Mormon scientist?"
        onPlaying { draft { 1 }; build { 1 } }
        cardCost = listOf(red, red, blue, blue)
    }
    agent {
        count = 2
        name = "Panaman Broker"
        flavorText = "Do you want to buy or sell?"
        onPlaying {
            chooseOne {
                draft { 1 }
                stealCredits { 3 }
            }
        }
        cardCost = listOf(yellow, yellow, yellow, yellow)
    }
    agent {
        count = 2
        name = "Rebel Captain"
        flavorText = "I don't give a fudge about your president"
        onPlaying {
            chooseOne {
                flipStation { self }
                doAll { discard { 1 }; flipStation { 2 } }
            }
        }
        cardCost = listOf(blue, blue, blue)
    }
    agent {
        count = 2
        name = "Saboteur"
        flavorText = "Criticism is not nearly as effective as sabotage"
        onPlaying { eachOpponent { discard { 2 } } }
        cardCost = listOf(yellow, yellow, yellow, yellow)
    }
    agent {
        count = 2
        name = "Solicitor"
        flavorText = "We'll give you a 200% raise and free peanuts"
        onPlaying {
            chooseOne {
                flipStation { 1 }
                stealModule { "Asteroid Grinder" }
                stealModule { "Inflatable Habitat" }
            }
        }
        cardCost = listOf(blue, blue, yellow, yellow)
    }
    agent {
        count = 2
        name = "Space Unicorn"
        flavorText = "\"When something is important enough, you do it even if the odds are not in your favor\" —Elon Musk"
        onPlaying { draw { 1 }; gainCredits { handSize } }
        cardCost = listOf(red, red, yellow, yellow)
    }
    agent {
        count = 2
        name = "Spybot.py"
        flavorText = "Hello World!"
        onPlaying {
            chooseOpponent()
            viewHand { chosenPlayer }
            chooseOne {
                draw { 1 }
                chosenPlayer { discard { 1 } }
            }
        }
        cardCost = listOf()
    }
    influence {
        count = 1
        name = "Lunar Alliance"
        effect = staticEffect { forbidStealingCredits }
    }
    influence {
        count = 1
        name = "Runaway Bureaucracy"
        effect = whenOccurs { draftAnyInfluence } takeAction { discard { 2 } }
    }
    influence {
        count = 1
        name = "Terran Crackdown"
        effect = whenOccurs { discardThisInfluence } takeAction { eachPlayer { flipStationTo { agendaSide } } }
    }
    influence {
        count = 1
        name = "Terran Embargo"
        effect = staticEffect { noShuttleCredits }
    }
    influence {
        count = 1
        name = "Entropic Cascade"
        effect = whenOccurs { discardThisInfluence } takeAction { draw { 4 }; discard { 3 } }
    }
    influence {
        count = 1
        name = "Laika's Paradise"
        effect = whenOccurs { buildDomeOrLaikaMemorial } takeAction { draft { 1 } }
    }
    influence {
        count = 1
        name = "Quarantine"
        effect = staticEffect { forbidDraftOtherInfluence }
    }
    influence {
        count = 1
        name = "Space Cowboy Capitalism"
        effect = whenOccurs { draftAnyInfluence } takeAction { stealCredits { 2 } }
    }
    module {
        count = 4
        name = "Asteroid Grinder"
        flavorText = "The moon has significant gravity, asteroids do not"
        cardColor = yellow
        connectors {
            top = yellow
            topLeft = yellow
            bottomLeft = yellow
        }
        onPlaying { opponent { resell { 2 } } }
        cardCost = listOf(yellow, yellow)
    }
    module {
        count = 2
        name = "Bacon Printer"
        flavorText = "Deepfake meat"
        cardColor = red
        connectors {
            top = red
            topRight = red
            bottomRight = red
            bottom = red
        }
        onPlaying { draw { 1 }; discard { 1 } }
        achievements = listOf(printer)
        colonists = 1
        cardCost = listOf(red, red, red)
    }
    module {
        count = 2
        name = "Beruang Engineers"
        cardColor = blue
        connectors {
            topLeft = blue
            bottomLeft = yellow
            bottom = blue
        }
        onPlaying { flipStation { 1 }; build { 1 } }
        colonists = 2
        cardCost = listOf(blue, blue, blue, blue, yellow)
    }
    module {
        count = 4
        name = "Experimental Borehole"
        flavorText = "You know the drill?"
        cardColor = red
        connectors {
            topRight = red
            bottomRight = red
            bottom = red
        }
        onPlaying { draw { 2 } }
        cardCost = listOf()
    }
    module {
        count = 2
        name = "Lang Huan Concrete"
        flavorText = "The boys were soon back to working for food and shelter... on the moon"
        cardColor = yellow
        connectors {
            bottomLeft = gray
            bottom = yellow
        }
        onPlaying { build { 1 }; eachPlayer { loseCredits { 1 } } }
        cardCost = listOf()
    }
    module {
        count = 2
        name = "Depot"
        flavorText = "Oil-fingers have a fridge full of cold alcohol-fee beer"
        cardColor = blue
        connectors {
            top = blue
            topRight = blue
            bottomRight = blue
        }
        onPlaying { build { 1 } }
        colonists = 1
        cardCost = listOf(blue, blue)
    }
    module {
        count = 1
        name = "Chandrasekhar Dome"
        cardColor = blue
        connectors {
            topLeft = yellow
            topRight = red
            bottomLeft = yellow
            bottomRight = blue
        }
        onPlaying { opponent { resell { 2 } } }
        achievements = listOf(dome)
        colonists = 2
        cardCost = listOf(red, blue, yellow)
    }
    module {
        count = 1
        name = "Hayashi Dome"
        cardColor = blue
        connectors {
            topLeft = yellow
            topRight = red
            bottomLeft = yellow
            bottomRight = blue
        }
        onPlaying { opponent { resell { 2 } } }
        achievements = listOf(dome)
        colonists = 2
        cardCost = listOf(red, blue, yellow)
    }
    module {
        count = 1
        name = "Oort Dome"
        cardColor = blue
        connectors {
            topLeft = yellow
            topRight = red
            bottomLeft = yellow
            bottomRight = blue
        }
        onPlaying { opponent { resell { 2 } } }
        achievements = listOf(dome)
        colonists = 2
        cardCost = listOf(red, blue, yellow)
    }
    module {
        count = 1
        name = "Struve Dome"
        cardColor = blue
        connectors {
            topLeft = yellow
            topRight = red
            bottomLeft = yellow
            bottomRight = blue
        }
        onPlaying { opponent { resell { 2 } } }
        achievements = listOf(dome)
        colonists = 2
        cardCost = listOf(red, blue, yellow)
    }
    module {
        count = 2
        name = "Helium Factory"
        flavorText = "Helium-3 is the new gold"
        cardColor = yellow
        connectors {
            top = yellow
            topLeft = yellow
            bottomLeft = yellow
            bottom = yellow
        }
        mainAction { stealCredits { 2 }; flipStation { self } }
        colonists = 2
        cardCost = listOf(yellow, yellow, blue, red)
    }
    module {
        count = 2
        name = "Fusion Reactor"
        cardColor = blue
        connectors {
            top = red
            topLeft = red
            topRight = blue
            bottomLeft = yellow
            bottomRight = blue
            bottom = blue
        }
        mainAction { build { 1 }; draw { 1 }; discard { 1 } }
        achievements = listOf(fusion)
        colonists = 1
        cardCost = listOf(blue, blue, red, red)
    }
    module {
        count = 4
        name = "Inflatable Habitat"
        flavorText = "Smells like a new car"
        cardColor = blue
        connectors {
            top = gray
            topRight = blue
            bottomRight = blue
        }
        colonists = 2
        cardCost = listOf()
    }
    module {
        count = 2
        name = "Indigo Egregore"
        flavorText = "Civilization under construction. Refugees welcome."
        cardColor = blue
        connectors {
            top = blue
            bottomLeft = blue
            bottomRight = blue
            bottom = blue
        }
        colonists = 3
        cardCost = listOf(blue, blue, blue, blue)
    }
    module {
        count = 2
        name = "Artificial Intellect"
        flavorText = "Economy became just one more game that the computer wins"
        cardColor = red
        connectors {
            top = red
            topLeft = red
            topRight = red
            bottomLeft = red
            bottomRight = red
            bottom = yellow
        }
        orbs = listOf(red)
        effect = staticEffect { redOrbsGainCredits }
        cardCost = listOf(yellow, red, red, red, red, red)
    }
    module {
        count = 2
        name = "Laika Memorial"
        flavorText = "1954 (Earth)–1957 (Space)"
        cardColor = red
        connectors {
            top = gray
            topLeft = gray
            bottomLeft = gray
            bottom = gray
        }
        onPlaying { discard { handSize } }
        achievements = listOf(laika)
        cardCost = listOf()
    }
    module {
        count = 2
        name = "Lunar Capital"
        cardColor = blue
        connectors {
            top = blue
            topLeft = blue
            topRight = blue
            bottomLeft = gray
            bottomRight = blue
            bottom = blue
        }
        onPlaying { flipStation { anyNumber } }
        colonists = 3
        cardCost = listOf(blue, blue, blue, blue, yellow, yellow)
    }
    module {
        count = 4
        name = "Rover"
        flavorText = "Theft alarm not included"
        cardColor = red
        connectors {
            topLeft = red
            bottomLeft = red
            bottom = yellow
        }
        onPlaying { opponent { resell { 1 } } }
        achievements = listOf(rover)
        cardCost = listOf(red)
    }
    module {
        count = 2
        name = "Satellite"
        flavorText = "A satellite photo is better than a thousand words"
        cardColor = red
        connectors {
            top = yellow
            topRight = red
        }
        onPlaying { resell { influenceCount } }
        achievements = listOf(satellite)
        cardCost = listOf(red, red)
    }
    module {
        count = 2
        name = "Space Elevator"
        connectors {
            top = gray
            topLeft = gray
            topRight = gray
            bottomLeft = gray
            bottomRight = gray
            bottom = gray
        }
        mainAction { draft { 2 } }
        achievements = listOf(elevator)
        colonists = 2
        cardCost = listOf(blue, blue, yellow, yellow, red, red)
    }
    module {
        count = 2
        name = "Smart Spaceship"
        flavorText = "Optimized fusion means faster delivery of pizzas"
        cardColor = red
        connectors {
            top = gray
            topLeft = red
            topRight = red
            bottomLeft = red
            bottomRight = red
        }
        onPlaying { draft { 2 } }
        achievements = listOf(ai)
        cardCost = listOf(red, red, red, red, red)
    }
    module {
        count = 2
        name = "J. Lagg Telescope"
        flavorText = "Coming soon"
        cardColor = red
        connectors {
            topLeft = red
            topRight = red
            bottomLeft = red
            bottom = red
        }
        onPlaying { draw { 2 }; draft { 1 } }
        achievements = listOf(telescope)
        cardCost = listOf(red, red, red, red)
    }
    module {
        count = 2
        name = "Underground Headquarters"
        flavorText = "A shadow government won't stay in the shadows forever"
        cardColor = blue
        connectors {
            topRight = blue
            bottomRight = blue
            bottom = blue
        }
        mainAction { flipStation { self }; build { 1 } }
        colonists = 2
        cardCost = listOf(blue, blue)
    }
    stationFront {
        name = "Terran Outpost"
        connectors {
            top = red
            topLeft = blue
            topRight = gray
            bottomLeft = blue
            bottomRight = yellow
        }
        mainAction {
            chooseOne {
                draft { 1 }
                doAll { build { 2 }; draw { 1 } }
            }
        }
    }
    station {
        count = 1
        name = "Dark Side"
        orbs = listOf(red, yellow)
        mainAction {
            chooseOne {
                draft { 1 }
                build { 1 }
                doAll { build { 1 }; draft { 1 }; target { discard { 1 } } }
            }
        }
        achievements = listOf(borg)
        colonists = 1
    }
    station {
        count = 1
        name = "Imbrium"
        orbs = listOf(blue, yellow)
        mainAction {
            chooseOne {
                draft { 1 }
                doAll { stealCredits { 3 }; build { 1 } }
            }
        }
        achievements = listOf(moonwalk)
        colonists = 2
    }
    station {
        count = 1
        name = "Selene Labs"
        orbs = listOf(red, red)
        mainAction {
            chooseOne {
                draft { 1 }
                build { 1 }
                draw { 3 }
            }
        }
        achievements = listOf(chemistry, dna)
        colonists = 1
    }
    station {
        count = 1
        name = "Shackleton"
        orbs = listOf(blue, blue)
        mainAction {
            chooseOne {
                draft { 1 }
                doAll { build { 2 }; draw { 1 } }
            }
        }
        colonists = 2
    }
    station {
        count = 1
        name = "Taikotech"
        orbs = listOf(yellow, yellow)
        mainAction {
            chooseOne {
                draft { 1 }
                doAll { draft { 1 }; resell { 2 } }
            }
        }
        colonists = 2
    }
    station {
        count = 1
        name = "The Oasis"
        orbs = listOf(blue, red)
        mainAction {
            chooseOne {
                draft { 1 }
                doAll { build { 1 }; draw { 2 } }
            }
        }
        achievements = listOf(botany)
        colonists = 1
    }
}
