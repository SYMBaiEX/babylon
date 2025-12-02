/**
 * HuggingFace Upload Utility
 *
 * Shared utility for uploading files to HuggingFace Hub.
 * Consolidates upload logic used across different services.
 */

import { exec } from 'node:child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'node:util';
import * as hubModule from '@huggingface/hub';
import { logger } from '../../utils/logger';

export interface UploadFileOptions {
  repo: { type: 'model' | 'dataset'; name: string };
  file: { path: string; content: Blob };
  credentials: { accessToken: string };
}

export interface CreateRepoOptions {
  repo: { type: 'model' | 'dataset'; name: string };
  credentials: { accessToken: string };
  private?: boolean;
}

export class HuggingFaceUploadUtil {
  /**
   * Upload a single file to HuggingFace Hub
   */
  static async uploadFile(
    repoName: string,
    repoType: 'model' | 'dataset',
    filePath: string,
    fileContent: string,
    token: string
  ): Promise<void> {
    const uploadFile = hubModule.uploadFile;

    await uploadFile({
      repo: { type: repoType, name: repoName },
      file: {
        path: filePath,
        content: new Blob([fileContent]),
      },
      credentials: {
        accessToken: token,
      },
    });

    logger.info(`Uploaded ${filePath} to ${repoName}`, {
      repo: repoName,
      type: repoType,
    });
  }

  /**
   * Upload directory to HuggingFace Hub
   */
  static async uploadDirectory(
    repoName: string,
    repoType: 'model' | 'dataset',
    localDir: string,
    token: string
  ): Promise<number> {
    const files = await fs.readdir(localDir);
    let uploadCount = 0;

    for (const file of files) {
      const filePath = path.join(localDir, file);
      const stats = await fs.stat(filePath);

      if (stats.isFile()) {
        const content = await fs.readFile(filePath, 'utf-8');

        await HuggingFaceUploadUtil.uploadFile(
          repoName,
          repoType,
          file,
          content,
          token
        );
        uploadCount++;
      }
    }

    logger.info(`Uploaded ${uploadCount} files to ${repoName}`, {
      repo: repoName,
      count: uploadCount,
    });

    return uploadCount;
  }

  /**
   * Ensure repository exists (create if needed)
   */
  static async ensureRepository(
    repoName: string,
    repoType: 'model' | 'dataset',
    token: string,
    isPrivate = false
  ): Promise<void> {
    const createRepo = hubModule.createRepo;

    try {
      await createRepo({
        repo: { type: repoType, name: repoName },
        credentials: { accessToken: token },
        private: isPrivate,
      });
      logger.info('Created new repository', { repo: repoName, type: repoType });
    } catch (error) {
      // Repository might already exist, which is fine
      if (
        error instanceof Error &&
        (error.message.includes('already exists') ||
          error.message.includes('Repository not found'))
      ) {
        logger.info('Repository already exists or accessible', {
          repo: repoName,
        });
      } else {
        logger.warn('Could not ensure repository exists', {
          error,
          repo: repoName,
        });
      }
    }
  }

  /**
   * Upload using huggingface-cli (fallback method)
   */
  static async uploadViaCLI(
    repoName: string,
    repoType: 'model' | 'dataset',
    localDir: string,
    token: string
  ): Promise<void> {
    try {
      const execAsync = promisify(exec);

      // Set token as environment variable
      process.env.HUGGINGFACE_HUB_TOKEN = token;

      console.log(
        `Uploading ${localDir} to ${repoName} via huggingface-cli...`
      );

      await execAsync(
        `huggingface-cli upload ${repoName} ${localDir} --repo-type ${repoType}`
      );

      logger.info('Successfully uploaded via huggingface-cli', {
        repo: repoName,
      });
    } catch (error) {
      logger.error('CLI upload failed', { error });
      throw error;
    }
  }

  /**
   * Provide manual upload instructions
   */
  static getManualUploadInstructions(
    repoName: string,
    repoType: 'model' | 'dataset',
    localDir: string
  ): string[] {
    return [
      '1. Install huggingface-cli: pip install huggingface_hub',
      '2. Login: huggingface-cli login',
      `3. Upload: huggingface-cli upload ${repoName} ${localDir} --repo-type ${repoType}`,
    ];
  }
}
