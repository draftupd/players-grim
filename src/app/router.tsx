import { createBrowserRouter } from "react-router-dom";
import HomePage from "../pages/HomePage";
import NewGamePage from "../pages/NewGamePage";
import GamePage from "../pages/GamePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/games/new",
    element: <NewGamePage />,
  },
  {
    path: "/games/:gameId",
    element: <GamePage />,
  },
]);

