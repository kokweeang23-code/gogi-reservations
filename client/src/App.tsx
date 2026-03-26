import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import BookingPage from "@/pages/BookingPage";
import AdminPage from "@/pages/AdminPage";
import NotFound from "@/pages/not-found";
import PerplexityAttribution from "@/components/PerplexityAttribution";
import { useEffect } from "react";

// Redirect ?admin query param to /#/admin (for email links where hash is stripped)
function QueryParamRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("admin")) {
      window.location.replace(window.location.pathname + "#/admin");
    }
  }, []);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryParamRedirect />
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={BookingPage} />
          <Route path="/admin" component={AdminPage} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      <Toaster />
      <PerplexityAttribution />
    </QueryClientProvider>
  );
}
