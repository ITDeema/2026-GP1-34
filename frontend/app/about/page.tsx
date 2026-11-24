import { redirect } from "next/navigation";

// "About us" is now a section of the landing page. Old links to /about go there.
export default function About() {
  redirect("/#about");
}