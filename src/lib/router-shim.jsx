'use client';

/**
 * react-router-dom → next/navigation compatibility shim.
 *
 * Exposes the small surface used by the existing telco-portal codebase
 * (Link/NavLink/Navigate/useNavigate/useLocation/useParams/useSearchParams/
 *  useNavigationType/Outlet) on top of next/link + next/navigation, so the
 * page/component source can stay identical.
 *
 * One-line migration per file: replace
 *   from "react-router-dom"
 * with
 *   from "@/lib/router-shim"
 */

import { useEffect, useMemo, forwardRef } from 'react';
import NextLink from 'next/link';
import {
  useRouter,
  usePathname,
  useSearchParams as useNextSearchParams,
  useParams as useNextParams,
} from 'next/navigation';

function resolveHref(to) {
  if (to == null) return '#';
  if (typeof to === 'string') return to;
  // react-router supports { pathname, search, hash, state }
  const pathname = to.pathname || '';
  const search = to.search ? (to.search.startsWith('?') ? to.search : `?${to.search}`) : '';
  const hash = to.hash ? (to.hash.startsWith('#') ? to.hash : `#${to.hash}`) : '';
  return `${pathname}${search}${hash}` || '#';
}

export const Link = forwardRef(function Link(
  { to, href, replace, state: _state, target, rel, prefetch, ...rest },
  ref
) {
  const resolved = href ?? resolveHref(to);
  // Forward `replace` so router pushes are replaced as in react-router.
  return (
    <NextLink
      ref={ref}
      href={resolved}
      replace={replace}
      target={target}
      rel={rel}
      prefetch={prefetch}
      {...rest}
    />
  );
});

export const NavLink = forwardRef(function NavLink(
  { to, href, end, className, style, children, ...rest },
  ref
) {
  const resolved = href ?? resolveHref(to);
  const pathname = usePathname() || '/';
  const targetPath = (typeof resolved === 'string' ? resolved : '').split('?')[0].split('#')[0];
  const isActive = end
    ? pathname === targetPath
    : pathname === targetPath || pathname.startsWith(`${targetPath}/`);

  const resolvedClass =
    typeof className === 'function' ? className({ isActive, isPending: false }) : className;
  const resolvedStyle =
    typeof style === 'function' ? style({ isActive, isPending: false }) : style;
  const resolvedChildren =
    typeof children === 'function' ? children({ isActive, isPending: false }) : children;

  return (
    <NextLink ref={ref} href={resolved} className={resolvedClass} style={resolvedStyle} {...rest}>
      {resolvedChildren}
    </NextLink>
  );
});

export function useNavigate() {
  const router = useRouter();
  return useMemo(() => {
    function navigate(to, options) {
      if (typeof to === 'number') {
        if (to < 0) window.history.go(to);
        else window.history.go(to);
        return;
      }
      const href = resolveHref(to);
      if (options?.replace) router.replace(href);
      else router.push(href);
    }
    return navigate;
  }, [router]);
}

export function useLocation() {
  const pathname = usePathname() || '/';
  const params = useNextSearchParams();
  const search = params?.toString() ? `?${params.toString()}` : '';
  return useMemo(
    () => ({
      pathname,
      search,
      hash: typeof window !== 'undefined' ? window.location.hash : '',
      state: null,
      key: 'default',
    }),
    [pathname, search]
  );
}

export function useParams() {
  return useNextParams() || {};
}

/**
 * react-router's useSearchParams returns a [params, setParams] tuple.
 * next/navigation's useSearchParams returns a ReadonlyURLSearchParams.
 * Wrap it so the tuple consumers keep working.
 */
export function useSearchParams() {
  const params = useNextSearchParams();
  const pathname = usePathname() || '/';
  const router = useRouter();

  const setSearchParams = (next, options) => {
    const usp =
      next instanceof URLSearchParams
        ? next
        : new URLSearchParams(typeof next === 'function' ? next(params) : next || {});
    const qs = usp.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (options?.replace) router.replace(url);
    else router.push(url);
  };

  return [params || new URLSearchParams(), setSearchParams];
}

export function useNavigationType() {
  // Next.js doesn't expose POP vs PUSH; default to PUSH so scroll-restoration
  // logic that branches on it lands on the "fresh navigation" path.
  return 'PUSH';
}

/**
 * Drop-in replacement for <Navigate to="/foo" replace />. Performs the
 * navigation in an effect and renders null.
 */
export function Navigate({ to, replace = false }) {
  const router = useRouter();
  const href = resolveHref(to);
  useEffect(() => {
    if (replace) router.replace(href);
    else router.push(href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href, replace]);
  return null;
}

/**
 * No-op in App Router — children are passed automatically via props in
 * nested layouts. Components that imported <Outlet/> will render nothing
 * by default, which is fine because the page/layout above already renders
 * its children prop.
 */
export function Outlet() {
  return null;
}
