module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__tests__/__mocks__/asyncStorage.js',
    '^expo-location$': '<rootDir>/__tests__/__mocks__/expoLocation.js',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};
