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

export const THEME_STORAGE_KEY = "ttt-theme-preference"; 
export const PWA_URL = "https://localhost:5173"