"use client";

import { useEffect, useRef, useState } from "react";
import type { Meme } from "@/lib/contracts";
import { MemeMedia } from "./ui";
import { XEmbed } from "./x-embed";
import styles from "./profile-posts.module.css";

const nearViewportMargin = "480px 0px";

function embedCaption(post: Meme) {
  if (post.type !== "x") return post.caption;
  const caption = post.caption.trim();
  if (
    !caption ||
    caption === post.xPost.url.trim() ||
    /^https?:\/\/t\.co\/\S+$/i.test(caption)
  ) {
    return "";
  }
  return post.caption;
}

function useNearViewport(initiallyWarm: boolean) {
  const elementRef = useRef<HTMLElement | null>(null);
  const [nearViewport, setNearViewport] = useState(initiallyWarm);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(Boolean(entry?.isIntersecting)),
      { rootMargin: nearViewportMargin, threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [elementRef, nearViewport] as const;
}

function LikedPost({ post, index }: { post: Meme; index: number }) {
  const [elementRef, nearViewport] = useNearViewport(index < 2);
  return (
    <article ref={elementRef} className={styles.item} aria-label="Liked meme">
      <div className={styles.media}>
        {post.type === "x" ? (
          <XEmbed
            post={post.xPost}
            caption={embedCaption(post)}
            active={nearViewport}
            warm={nearViewport}
            fit={false}
          />
        ) : (
          <MemeMedia meme={post} active={nearViewport} />
        )}
      </div>
    </article>
  );
}

export function ProfilePosts({ posts }: { posts: Meme[] }) {
  return (
    <section className={styles.section} aria-labelledby="public-liked-posts-title">
      <div className="section-heading-row">
        <h2 id="public-liked-posts-title">Liked memes</h2>
      </div>
      {posts.length ? (
        <div className={styles.list}>
          {posts.map((post, index) => (
            <LikedPost key={post.id} post={post} index={index} />
          ))}
        </div>
      ) : (
        <p className="supporting">No liked memes yet.</p>
      )}
    </section>
  );
}
