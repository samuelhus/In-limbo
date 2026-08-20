import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '@/index.css';
import '@/App.css';

import { AuthProvider } from '@/contexts/AuthContext';
import TestBanner from '@/components/TestBanner';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from '@/components/ScrollToTop';
import DocumentMeta from '@/components/DocumentMeta';

import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Pending from '@/pages/Pending';
import Rejected from '@/pages/Rejected';
import Catalogus from '@/pages/Catalogus';
import ListingDetail from '@/pages/ListingDetail';
import ListingWizard from '@/pages/ListingWizard';
import SearchRequestWizard from '@/pages/SearchRequestWizard';
import MijnZoekertjes from '@/pages/MijnZoekertjes';
import OrganisationPage from '@/pages/OrganisationPage';
import Profiel from '@/pages/Profiel';
import MijnOrganisatie from '@/pages/MijnOrganisatie';
import MijnAanvragen from '@/pages/MijnAanvragen';
import MijnAanbiedingen from '@/pages/MijnAanbiedingen';
import AdminPanel from '@/pages/AdminPanel';
import DonateurRegister from '@/pages/DonateurRegister';
import OverOns from '@/pages/OverOns';
import Partners from '@/pages/Partners';
import Contact from '@/pages/Contact';
import Nieuws from '@/pages/Nieuws';
import NieuwsDetail from '@/pages/NieuwsDetail';
import Inspiratie from '@/pages/Inspiratie';
import InspiratieDetail from '@/pages/InspiratieDetail';
import ImpactMethodologie from '@/pages/ImpactMethodologie';
import Checkout from '@/pages/Checkout';
import Checkin from '@/pages/Checkin';
import WachtwoordVergeten from '@/pages/WachtwoordVergeten';
import WachtwoordReset from '@/pages/WachtwoordReset';
import Notificaties from '@/pages/Notificaties';
import Berichten from '@/pages/Berichten';
import GesprekDetail from '@/pages/GesprekDetail';
import Voorwaarden from '@/pages/Voorwaarden';
import Privacy from '@/pages/Privacy';
import AdminDonateurListings from '@/pages/AdminDonateurListings';


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
      <DocumentMeta />
      <ScrollToTop />
      <AuthProvider>
        <div className="min-h-screen flex flex-col">
          <TestBanner />
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/registreer" element={<Register />} />
              <Route path="/donateur/registreer" element={<DonateurRegister />} />
              <Route path="/over-ons" element={<OverOns />} />
              <Route path="/partners" element={<Partners />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/nieuws" element={<Nieuws />} />
              <Route path="/nieuws/:id" element={<NieuwsDetail />} />
              <Route path="/inspiratie" element={<Inspiratie />} />
              <Route path="/inspiratie/:id" element={<InspiratieDetail />} />
              <Route path="/impact-methodologie" element={<ImpactMethodologie />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/wachtwoord-vergeten" element={<WachtwoordVergeten />} />
              <Route path="/wachtwoord-reset" element={<WachtwoordReset />} />
              <Route
                path="/checkin"
                element={
                  <ProtectedRoute requireAdmin requireValidated={false}>
                    <Checkin />
                  </ProtectedRoute>
                }
              />
              <Route path="/voorwaarden" element={<Voorwaarden />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route
                path="/notificaties"
                element={
                  <ProtectedRoute allowDonateur>
                    <Notificaties />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/berichten"
                element={
                  <ProtectedRoute allowDonateur>
                    <Berichten />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/berichten/:id"
                element={
                  <ProtectedRoute allowDonateur>
                    <GesprekDetail />
                  </ProtectedRoute>
                }
              />

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
                  <ProtectedRoute allowDonateur>
                    <ListingWizard editMode />
                  </ProtectedRoute>
                }
              />
              <Route path="/aanbieding/:id" element={<ListingDetail />} />
              <Route path="/organisaties/:id" element={<OrganisationPage />} />

              <Route
                path="/aanbieding/nieuw"
                element={
                  <ProtectedRoute allowDonateur>
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
                  <ProtectedRoute allowDonateur>
                    <MijnAanbiedingen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/zoekertje/nieuw"
                element={
                  <ProtectedRoute>
                    <SearchRequestWizard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/zoekertje/:id/bewerken"
                element={
                  <ProtectedRoute>
                    <SearchRequestWizard editMode />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/mijn-zoekertjes"
                element={
                  <ProtectedRoute>
                    <MijnZoekertjes />
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
              
              <Route
                path="/admin/donateur/:userId"
                element={
                  <ProtectedRoute requireAdmin requireValidated={false}>
                    <AdminDonateurListings />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/zoekertje/nieuw"
                element={
                  <ProtectedRoute requireAdmin requireValidated={false}>
                    <SearchRequestWizard adminMode />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/zoekertje/:id/bewerken"
                element={
                  <ProtectedRoute requireAdmin requireValidated={false}>
                    <SearchRequestWizard adminMode editMode />
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
