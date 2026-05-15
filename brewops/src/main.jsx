import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth.jsx'
import { BreweryProvider } from './hooks/useBrewery.jsx'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <BreweryProvider>
        <App />
      </BreweryProvider>
    </AuthProvider>
  </BrowserRouter>
)
