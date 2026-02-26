import axios from "axios";

const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3001"                    //Localhost
    : "https://worldsecure-crm.onrender.com";     //_BACKEND_ON_RENDER

const api = axios.create({
  baseURL: API_BASE_URL,
});

export default api;
