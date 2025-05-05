export enum UserPrestigeTitle {
    TaskPeasant = "Task Peasant",
    SquireOfSmallChores = "Squire of Small Chores",
    ApprenticeOfProcrastination = "Apprentice of Procrastination",
    ChecklistPadawan = "Checklist Padawan",
    ErrandIntern = "Errand Intern",
    KnightOfTheToDoTable = "Knight of the To-Do Table",
    DukeOfDeadlines = "Duke of Deadlines",
    TimeTamingBaron = "Time-Taming Baron",
    MasterOfMundanity = "Master of Mundanity",
    ViscountOfVictory = "Viscount of Victory",
    TheTaskfather = "The Taskfather",
    GrandAdmiralOfGoals = "Grand Admiral of Goals",
    TheChosenOne = "The Chosen One (of Productivity)",
    EarlOfEfficiency = "Earl of Efficiency",
    HighlordOfHabits = "Highlord of Habits",
    TheTerminatorOfTasks = "The Terminator of Tasks",
    DreadSovereign = "Dread Sovereign of the Schedule",
    EmperorOfExecution = "Emperor of Execution",
    ChecklistCrusader = "Checklist Crusader",
    ProductivityPaladin = "Productivity Paladin",
    KingInTheNorth = "King in the North (of Notes)",
    TheOneWhoGetsThingsDone = "The One Who Gets Things Done",
    OverlordOfOrganization = "Overlord of Organization",
    SupremeBeingOfTheBulletPoints = "Supreme Being of the Bullet Points"
}

export type UserPrestigeLevel = {
    title: UserPrestigeTitle;
    description: string;
    minTasksCompleted: number;
};

// Esempio di array ordinato di titoli con descrizione e requisito
export const prestigeLevels: UserPrestigeLevel[] = [
    {
        title: UserPrestigeTitle.TaskPeasant,
        description: "Barely started... but hey, it's a start!",
        minTasksCompleted: 0,
    },
    {
        title: UserPrestigeTitle.SquireOfSmallChores,
        description: "You’ve taken up arms against laziness.",
        minTasksCompleted: 5,
    },
    {
        title: UserPrestigeTitle.ApprenticeOfProcrastination,
        description: "You get things done... eventually.",
        minTasksCompleted: 10,
    },
    {
        title: UserPrestigeTitle.ChecklistPadawan,
        description: "Strong in the task-force, you are.",
        minTasksCompleted: 20,
    },
    {
        title: UserPrestigeTitle.ErrandIntern,
        description: "Coffee runs and post-it notes are your life.",
        minTasksCompleted: 30,
    },
    {
        title: UserPrestigeTitle.KnightOfTheToDoTable,
        description: "Brave knight of productivity, rise!",
        minTasksCompleted: 50,
    },
    {
        title: UserPrestigeTitle.DukeOfDeadlines,
        description: "You laugh in the face of time limits.",
        minTasksCompleted: 75,
    },
    {
        title: UserPrestigeTitle.TimeTamingBaron,
        description: "You've bent time to your will.",
        minTasksCompleted: 125,
    },
    {
        title: UserPrestigeTitle.MasterOfMundanity,
        description: "Even the boring gets done by your hand.",
        minTasksCompleted: 150,
    },
    {
        title: UserPrestigeTitle.ViscountOfVictory,
        description: "You're on the verge of legendary.",
        minTasksCompleted: 175,
    },
    {
        title: UserPrestigeTitle.TheTaskfather,
        description: "They come to you... for deadlines.",
        minTasksCompleted: 200,
    },
    {
        title: UserPrestigeTitle.GrandAdmiralOfGoals,
        description: "You command your objectives like a fleet.",
        minTasksCompleted: 250,
    },
    {
        title: UserPrestigeTitle.TheChosenOne,
        description: "Prophecy foretold your organized destiny.",
        minTasksCompleted: 300,
    },
    {
        title: UserPrestigeTitle.EarlOfEfficiency,
        description: "You don’t work hard. You work smart.",
        minTasksCompleted: 350,
    },
    {
        title: UserPrestigeTitle.HighlordOfHabits,
        description: "Routines kneel before your consistency.",
        minTasksCompleted: 400,
    },
    {
        title: UserPrestigeTitle.TheTerminatorOfTasks,
        description: "You’ll be done.",
        minTasksCompleted: 500,
    },
    {
        title: UserPrestigeTitle.DreadSovereign,
        description: "Fear not the schedule — you are the schedule.",
        minTasksCompleted: 600,
    },
    {
        title: UserPrestigeTitle.EmperorOfExecution,
        description: "You rule over the realm of getting stuff done.",
        minTasksCompleted: 700,
    },
    {
        title: UserPrestigeTitle.ChecklistCrusader,
        description: "Every task completed is a holy mission.",
        minTasksCompleted: 800,
    },
    {
        title: UserPrestigeTitle.ProductivityPaladin,
        description: "Honor, glory, and time blocking.",
        minTasksCompleted: 900,
    },
    {
        title: UserPrestigeTitle.KingInTheNorth,
        description: "Winter is done. Your tasks are not.",
        minTasksCompleted: 1000,
    },
    {
        title: UserPrestigeTitle.TheOneWhoGetsThingsDone,
        description: "Say your name. Tasks fear it.",
        minTasksCompleted: 1200,
    },
    {
        title: UserPrestigeTitle.OverlordOfOrganization,
        description: "Folders within folders. Nothing escapes you.",
        minTasksCompleted: 1400,
    },
    {
        title: UserPrestigeTitle.SupremeBeingOfTheBulletPoints,
        description: "You’ve ascended. Your checklist is divine.",
        minTasksCompleted: 1600,
    }
];

export type category = { name: string, points: number }
export type friend = { username: string, email: string }
export type userDBentry = {
    age: number,
    categories: category[],
    createdAt: Date,
    email: string,
    firstName: string,
    lastName: string,
    licenseIsValid: boolean,
    licenseKey: string,
    notifications: boolean,
    permissions: boolean,
    phone: string,
    timeTrackerActive: boolean,
    username: string,
    karmaCoinsBalance: number,
    friends: friend[],
    avatarImagePath: string,
    fcmToken: string
}