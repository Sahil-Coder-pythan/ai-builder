import type { Metadata } from "next";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
export const metadata:Metadata={
 title:"THE ALPHA GYM — Kashipur | Train Beyond Limits",
 description:"Enter The Alpha Gym, Patel Nagar, Kashipur. Strength training, expert guidance and a community built for progress. Book your free trial.",
 keywords:["The Alpha Gym","Gym in Kashipur","Patel Nagar","Strength training","Fitness"],
 openGraph:{title:"THE ALPHA GYM — Built For More",description:"A new standard of strength in Kashipur.",type:"website"}
};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body><SmoothScroll>{children}</SmoothScroll></body></html>;
}
