import * as fs from 'fs';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { Octokit } from '@octokit/rest';
import { ParquetWriter } from 'parquetjs';
import * as parquet from 'parquetjs';

const secretsManager = new SecretsManagerClient({
  region: process.env.AWS_REGION,
});
const s3Client = new S3Client({ region: process.env.AWS_REGION });

interface RepoInsights {
  repoName: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  closedIssues: number;
  openPullRequests: number;
  mergedPullRequests: number;
  closedPullRequests: number;
  watchers: number;
  language: string;
  topics: string[];
  license: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  latestRelease: string;
  latestReleaseDate: string;
  contributorsCount: number;
  commitsLastWeek: number;
  commitsLastMonth: number;
  averageTimeToMergePR: number;
  averageTimeToClosePR: number;
  averageTimeToCloseIssue: number;
}

interface Repository {
  owner: string;
  repo: string;
}

export const handler = async (): Promise<void> => {
  try {
    const githubToken = await getGitHubToken();
    const octokit = new Octokit({ auth: githubToken });
    await testGitHubAuthentication(octokit);

    const repositories = await getRepositoriesFromS3();
    const insights = await fetchRepositoryInsights(octokit, repositories);

    await uploadInsightsToS3(insights);
  } catch (error) {
    console.error('Error in Lambda execution:', error);
    throw error;
  }
};

async function getGitHubToken(): Promise<string> {
  const secretName = process.env.GITHUB_TOKEN_SECRET_NAME;
  if (!secretName) {
    throw new Error('GITHUB_TOKEN_SECRET_NAME environment variable is not set');
  }
  const secretResponse = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );
  const secretString = secretResponse.SecretString;
  if (!secretString) {
    throw new Error('GitHub token not found in Secrets Manager');
  }
  const secretJson = JSON.parse(secretString) as { GITHUB_TOKEN: string };
  const githubToken = secretJson.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error('GitHub token not found in the secret JSON');
  }
  return githubToken;
}

async function testGitHubAuthentication(octokit: Octokit): Promise<void> {
  try {
    const { data: user } = await octokit.rest.users.getAuthenticated();
    console.log(`Authenticated as GitHub user: ${user.login}`);
  } catch (error) {
    console.error('Error authenticating with GitHub:', error);
    throw new Error('Failed to authenticate with GitHub');
  }
}

async function fetchRepositoryInsights(
  octokit: Octokit,
  repositories: Repository[],
): Promise<RepoInsights[]> {
  return (
    await Promise.all(
      repositories.map(async ({ owner, repo }) => {
        try {
          console.log(`Fetching data for ${owner}/${repo}`);
          const repoData = await octokit.rest.repos.get({ owner, repo });
          const [
            issuesData,
            pullRequestsData,
            contributorsData,
            releasesData,
            commitsData,
          ] = await Promise.all([
            octokit.rest.issues.listForRepo({ owner, repo, state: 'all' }),
            octokit.rest.pulls.list({ owner, repo, state: 'all' }),
            octokit.rest.repos.listContributors({ owner, repo }),
            octokit.rest.repos
              .getLatestRelease({ owner, repo })
              .catch(() => null),
            octokit.rest.repos.getCommitActivityStats({ owner, repo }),
          ]);

          const closedIssues = issuesData.data.filter(
            (issue) => issue.state === 'closed' && !issue.pull_request,
          ).length;
          const openPullRequests = pullRequestsData.data.filter(
            (pr) => pr.state === 'open',
          ).length;
          const mergedPullRequests = pullRequestsData.data.filter(
            (pr) => pr.merged_at !== null,
          ).length;
          const closedPullRequests = pullRequestsData.data.filter(
            (pr) => pr.state === 'closed' && pr.merged_at === null,
          ).length;

          let commitsLastWeek = 0;
          let commitsLastMonth = 0;

          if (Array.isArray(commitsData.data) && commitsData.data.length > 0) {
            commitsLastWeek =
              commitsData.data[commitsData.data.length - 1].total || 0;
            commitsLastMonth = commitsData.data
              .slice(-4)
              .reduce((sum, week) => sum + (week.total || 0), 0);
          } else {
            console.warn(
              `Unexpected commit data structure for ${owner}/${repo}`,
            );
          }

          const averageTimeToMergePR = calculateAverageTime(
            pullRequestsData.data.filter((pr) => pr.merged_at !== null),
            'created_at',
            'merged_at',
          );
          const averageTimeToClosePR = calculateAverageTime(
            pullRequestsData.data.filter(
              (pr) => pr.state === 'closed' && pr.merged_at === null,
            ),
            'created_at',
            'closed_at',
          );
          const averageTimeToCloseIssue = calculateAverageTime(
            issuesData.data.filter(
              (issue) => issue.state === 'closed' && !issue.pull_request,
            ),
            'created_at',
            'closed_at',
          );

          console.log(`Successfully fetched data for ${owner}/${repo}`);
          return {
            repoName: `${owner}/${repo}`,
            description: repoData.data.description || '',
            stars: repoData.data.stargazers_count,
            forks: repoData.data.forks_count,
            openIssues: repoData.data.open_issues_count,
            closedIssues,
            openPullRequests,
            mergedPullRequests,
            closedPullRequests,
            watchers: repoData.data.subscribers_count,
            language: repoData.data.language || '',
            topics: repoData.data.topics,
            license: repoData.data.license?.name || 'No License',
            size: repoData.data.size,
            createdAt: repoData.data.created_at,
            updatedAt: repoData.data.updated_at,
            pushedAt: repoData.data.pushed_at,
            latestRelease: releasesData?.data.name || 'No releases',
            latestReleaseDate: releasesData?.data.published_at || '',
            contributorsCount: contributorsData.data.length,
            commitsLastWeek,
            commitsLastMonth,
            averageTimeToMergePR,
            averageTimeToClosePR,
            averageTimeToCloseIssue,
          };
        } catch (error) {
          console.error(`Error fetching data for ${owner}/${repo}:`, error);
          return null;
        }
      }),
    )
  ).filter((insight): insight is RepoInsights => insight !== null);
}

function calculateAverageTime(
  items: any[],
  startDateKey: string,
  endDateKey: string,
): number {
  if (items.length === 0) return 0;
  const totalTime = items.reduce((sum, item) => {
    const startDate = new Date(item[startDateKey]);
    const endDate = new Date(item[endDateKey]);
    return sum + (endDate.getTime() - startDate.getTime());
  }, 0);
  return Math.round(totalTime / items.length / (1000 * 60 * 60)); // Convert to hours
}

async function getRepositoriesFromS3(): Promise<Repository[]> {
  const bucketName = process.env.INSIGHTS_BUCKET;
  const key = 'repositories.json';

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );

    const bodyContents = await streamToString(response.Body as Readable);
    return JSON.parse(bodyContents);
  } catch (error) {
    console.error('Error retrieving repositories from S3:', error);
    return [{ owner: 'aws-samples', repo: 'anthropic-on-aws' }];
  }
}

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function uploadInsightsToS3(insights: RepoInsights[]): Promise<void> {
  const bucketName = process.env.INSIGHTS_BUCKET;
  if (!bucketName) {
    throw new Error('INSIGHTS_BUCKET environment variable is not set');
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const timestamp = now.toISOString().replace(/[:.]/g, '');

  const schema = new parquet.ParquetSchema({
    repoName: { type: 'UTF8' },
    description: { type: 'UTF8' },
    stars: { type: 'INT64' },
    forks: { type: 'INT64' },
    openIssues: { type: 'INT64' },
    closedIssues: { type: 'INT64' },
    openPullRequests: { type: 'INT64' },
    mergedPullRequests: { type: 'INT64' },
    closedPullRequests: { type: 'INT64' },
    watchers: { type: 'INT64' },
    language: { type: 'UTF8' },
    topics: { type: 'UTF8', repeated: true },
    license: { type: 'UTF8' },
    size: { type: 'INT64' },
    createdAt: { type: 'UTF8' },
    updatedAt: { type: 'UTF8' },
    pushedAt: { type: 'UTF8' },
    latestRelease: { type: 'UTF8' },
    latestReleaseDate: { type: 'UTF8' },
    contributorsCount: { type: 'INT64' },
    commitsLastWeek: { type: 'INT64' },
    commitsLastMonth: { type: 'INT64' },
    averageTimeToMergePR: { type: 'DOUBLE' },
    averageTimeToClosePR: { type: 'DOUBLE' },
    averageTimeToCloseIssue: { type: 'DOUBLE' },
    date: { type: 'UTF8' },
  });

  const writer = await ParquetWriter.openFile(schema, '/tmp/insights.parquet');

  for (const insight of insights) {
    await writer.appendRow({
      ...insight,
      date: `${year}-${month}-${day}`,
    });
  }

  await writer.close();

  const fileContent = await fs.promises.readFile('/tmp/insights.parquet');

  const key = `github-insights/year=${year}/month=${month}/day=${day}/insights_${timestamp}.parquet`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileContent,
      ContentType: 'application/octet-stream',
    }),
  );

  console.log(`Successfully uploaded insights to S3: ${bucketName}/${key}`);
}
