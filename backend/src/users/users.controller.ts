import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { UserCard, UserDetails } from '@clinic/shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { bodyOf, parseId } from '../common/validation';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** api.md 4.7. Публичный маршрут; состав зависит от роли. */
  @Get()
  list(@CurrentUser() viewer: AuthUser | undefined): UserCard[] {
    return this.users.list(viewer);
  }

  /** api.md 4.8. */
  @Get(':id')
  @Roles('admin', 'root')
  get(@CurrentUser() viewer: AuthUser, @Param('id') id: string): UserDetails {
    return this.users.get(viewer, parseId(id));
  }

  /** api.md 4.9. */
  @Post()
  @Roles('admin', 'root')
  create(@CurrentUser() viewer: AuthUser, @Body() body: unknown): Promise<UserDetails> {
    return this.users.create(viewer, bodyOf(body));
  }

  /** api.md 4.10. */
  @Patch(':id')
  @Roles('admin', 'root')
  update(@CurrentUser() viewer: AuthUser, @Param('id') id: string, @Body() body: unknown): Promise<UserDetails> {
    return this.users.update(viewer, parseId(id), bodyOf(body));
  }
}
