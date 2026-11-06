import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import About from "@/components/About";
import Zones from "@/components/Zones";
import Trainers from "@/components/Trainers";
import Membership from "@/components/Membership";
import Gallery from "@/components/Gallery";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <About />
      <Zones />
      <Trainers />
      <Membership />
      <Gallery />
      <Contact />
      <Footer />
    </main>
  );
}
