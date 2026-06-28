import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const createJournalEntry = async (journalData) => {
  try {
    const response = await axios.post(`${API_URL}/journal`, journalData);
    return response.data;
  } catch (error) {
    console.error('Error creating journal entry:', error);
    throw error;
  }
};

export const getJournalEntries = async (userId) => {
  try {
    const response = await axios.get(`${API_URL}/journal/user/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    throw error;
  }
};

export const getJournalEntryByTrade = async (tradeId) => {
  try {
    const response = await axios.get(`${API_URL}/journal/trade/${tradeId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching journal entry:', error);
    throw error;
  }
};