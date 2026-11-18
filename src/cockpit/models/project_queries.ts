import { ChangeQuery } from "@/change/models/change_query";
import type { Project } from "@/pipeline/models/project";

export const ProjectQueries = {
  changeQuery(project: Project): ChangeQuery {
    return ChangeQuery.create({
      repos: project.repos.map((repo) => ({ repoName: repo.name, githubRepository: repo.githubRepository })),
      keyPattern: project.code.keyPattern,
      mergedDays: project.code.mergedDays,
    });
  },
};
