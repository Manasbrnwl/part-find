export const sendFCMNotification = async (token: string, data: any) => {
    console.log(`[Worker Mock] Sending FCM notification to ${token}:`, data);
    return true; // Simulate success
};

export const getFirebaseAdmin = () => {
    // Return a mock or throw if used
    return {
        auth: () => ({
            verifyIdToken: async (token: string) => ({
                user_id: 'mock_user_id',
                email: 'mock@example.com',
                name: 'Mock User',
            }),
        }),
    };
};
