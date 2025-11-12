import MarkdownIt from "markdown-it";
import markdownItAttrs from "markdown-it-attrs";

export default function (eleventyConfig) {
  // Copy assets straight through (Decap uploads live here)
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });

  // Markdown filter for Nunjucks templates (used by blocks)
  const md = new MarkdownIt({ html: true, linkify: true, breaks: false });
  md.use(markdownItAttrs);
  // Ensure markdown images respect pathPrefix using Eleventy's url filter
  try {
    const urlFilter =
      eleventyConfig.getFilter && eleventyConfig.getFilter("url");
    if (urlFilter) {
      const defaultImageRule = md.renderer.rules.image;
      md.renderer.rules.image = function (tokens, idx, options, env, self) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex("src");
        if (srcIndex >= 0) {
          const original = token.attrs[srcIndex][1];
          token.attrs[srcIndex][1] = urlFilter(original);
        }
        if (defaultImageRule) {
          return defaultImageRule(tokens, idx, options, env, self);
        }
        return self.renderToken(tokens, idx, options);
      };
    }
  } catch (e) {
    // no-op; fallback leaves image src untouched
  }
  eleventyConfig.addFilter("markdown", (content) => {
    if (!content) return "";
    return md.render(content);
  });

  // Post-process HTML to prefix image src using Eleventy's url filter (handles raw <img> in content)
  const urlFilter = eleventyConfig.getFilter && eleventyConfig.getFilter("url");
  eleventyConfig.addFilter("fixImgUrls", (html) => {
    if (!html || !urlFilter) return html || "";
    return String(html).replace(
      /(<img[^>]*\ssrc=["'])([^"']+)(["'][^>]*>)/gi,
      (_, head, src, tail) => {
        if (!src || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
          return head + src + tail;
        }
        return head + urlFilter(src) + tail;
      }
    );
  });
  // Make all sublevel pages default to article layout (keep section indexes as-is)
  eleventyConfig.addGlobalData("eleventyComputed", {
    layout: (data) => {
      const inputPath = (data.page && data.page.inputPath) || "";
      const hasExplicitLayout = !!data.layout;
      const isIndex = inputPath.endsWith("/index.md");
      const inArticleSections =
        inputPath.includes("/src/om-projektet/") ||
        inputPath.includes("/src/aia-forlob/") ||
        inputPath.includes("/src/begreber-og-fokusomraader/") ||
        inputPath.includes("/src/produkter/");

      if (inArticleSections && !isIndex) {
        return "article.njk";
      }
      return hasExplicitLayout ? data.layout : data.layout;
    },
  });

  // Section collections (auto-list pages under section indexes)
  eleventyConfig.addCollection("om_projektet", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/om-projektet/*.md")
      .filter((item) => item.fileSlug !== "index");
  });

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "html"],
    pathPrefix: "/AiA", // important for project pages
  };
}
