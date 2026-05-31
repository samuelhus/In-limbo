import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '@/index.css';
import '@/App.css';

import { AuthProvider } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from '@/components/ScrollToTop';

import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Pending from '@/pages/Pending';
import Rejected from '@/pages/Rejected';
import Catalogus from '@/pages/Catalogus';
import ListingDetail from '@/pages/ListingDetail';
import ListingWizard from '@/pages/ListingWizard';
import OrganisationPage from '@/pages/OrganisationPage';
import Profiel from '@/pages/Profiel';
import MijnOrganisatie from '@/pages/MijnOrganisatie';
import MijnAanvragen from '@/pages/MijnAanvragen';
import MijnAanbiedingen from '@/pages/MijnAanbiedingen';
import AdminPanel from '@/pages/AdminPanel';
import DonnateurRegister from '@/pages/DonnateurRegister';
import OverOns from '@/pages/OverOns';

function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-32 text-center" data-testid="not-found">
      <p className="overline mb-3">404</p>
      <h1 className="text-5xl font-bold tracking-tight">Verloren in limbo.</h1>
      <p className="mt-4 text-muted-foreground">Deze pagina bestaat niet.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/registreer" element={<Register />} />
              <Route path="/donnateur/registreer" element={<DonnateurRegister />} />
              <Route path="/over-ons" element={<OverOns />} />

              <Route
                path="/wachtkamer"
                element={
                  <ProtectedRoute requireValidated={false}>
                    <Pending />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/afgewezen"
                element={
                  <ProtectedRoute requireValidated={false}>
                    <Rejected />
                  </ProtectedRoute>
                }
              />

              <Route path="/catalogus" element={<Catalogus />} />
              <Route
                path="/aanbieding/:id/bewerken"
                element={
                  <ProtectedRoute allowDonnateur>
                    <ListingWizard editMode />
                  </ProtectedRoute>
                }
              />
              <Route path="/aanbieding/:id" element={<ListingDetail />} />
              <Route path="/organisaties/:id" element={<OrganisationPage />} />

              <Route
                path="/aanbieding/nieuw"
                element={
                  <ProtectedRoute allowDonnateur>
                    <ListingWizard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profiel"
                element={
                  <ProtectedRoute requireValidated={false}>
                    <Profiel />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organisatie"
                element={
                  <ProtectedRoute>
                    <MijnOrganisatie />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/aanvragen"
                element={
                  <ProtectedRoute>
                    <MijnAanvragen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/mijn-aanbiedingen"
                element={
                  <ProtectedRoute allowDonnateur>
                    <MijnAanbiedingen />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin requireValidated={false}>
                    <AdminPanel />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
