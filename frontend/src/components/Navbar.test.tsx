import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { useAuthStore, type User } from "@/store/useAuthStore";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn().mockResolvedValue({}) },
}));

const customer: User = {
  id: "u1",
  name: "Ada",
  email: "ada@example.com",
  role: "CUSTOMER",
};

const admin: User = {
  id: "u2",
  name: "Grace",
  email: "grace@example.com",
  role: "ADMIN",
};

const signIn = (user: User) => {
  useAuthStore.getState().setAuth(user, "token");
  useAuthStore.getState().setHydrated();
};

describe("Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
    useAuthStore.getState().setHydrated();
  });

  it("shows public links and a Login CTA when signed out", async () => {
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute("href", "/services");
    expect(screen.getByRole("link", { name: "Book Now" })).toHaveAttribute("href", "/book");
    expect(await screen.findByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText("Logout")).not.toBeInTheDocument();
  });

  it("greets a customer with My Bookings and logs out via the API", async () => {
    signIn(customer);
    render(<Navbar />);

    expect(await screen.findByText("My Bookings")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /logout/i })[0]);

    expect(api.post).toHaveBeenCalledWith("/auth/logout");
    expect(routerPush).toHaveBeenCalledWith("/");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("exposes the admin dropdown with proper aria state", async () => {
    signIn(admin);
    render(<Navbar />);

    const trigger = screen.getAllByRole("button", { name: /admin control/i })[0];
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "Admin sections" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "User Management" })).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the admin dropdown on Escape", async () => {
    signIn(admin);
    render(<Navbar />);

    fireEvent.click(screen.getAllByRole("button", { name: /admin control/i })[0]);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("profile modal is a labelled dialog that closes on Escape or backdrop click", async () => {
    signIn(customer);
    const { container } = render(<Navbar />);

    fireEvent.click(screen.getByTitle("View Profile by ID"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "profile-modal-title");
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reopen, then close via backdrop click
    fireEvent.click(screen.getByTitle("View Profile by ID"));
    await screen.findByRole("dialog");
    fireEvent.click(container.ownerDocument.querySelector(".fixed.inset-0")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("toggles the mobile menu button labels", () => {
    render(<Navbar />);

    const burger = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(burger);
    expect(
      screen.getByRole("button", { name: "Close navigation menu" })
    ).toBeInTheDocument();
  });
});
