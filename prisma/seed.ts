
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import { FriendRequestStatus, GroupInviteStatus, GroupRole, PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = `${process.env.DATABASE_URL}`
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting database seeding for NestJS...');

  // Clear existing data (optional but recommended for clean seeds)
  // Note: Since we have cascading deletes, clearing User and Group handles most of it
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  // Pre-hash a password so you can actually log in via your NestJS Auth endpoints
  // All users will have the password: 'password123'
  const salt = await bcrypt.genSalt();
  const hashedPassword = await bcrypt.hash('password123', salt);

  // ---------------------------------------------------
  // 1. CREATE USERS (40 Users)
  // ---------------------------------------------------
  const users: any[] = [];
  for (let i = 0; i < 40; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    
    const user = await prisma.user.create({
      data: {
        // Appending the index 'i' guarantees unique constraints are never violated
        userCode: `USR-${i}-${faker.string.alphanumeric(5).toUpperCase()}`,
        email: `user${i}_${faker.internet.email({ firstName, lastName })}`.toLowerCase(),
        password: hashedPassword,
        name: `${firstName} ${lastName}`,
        bio: faker.person.jobTitle(),
        avatarUrl: faker.image.avatar(),
        createdAt: faker.date.past({ years: 1 }),
      },
    });
    users.push(user);
  }
  console.log(`✅ Created ${users.length} Users. (Password for all: 'password123')`);

  // ---------------------------------------------------
  // 2. CREATE GROUPS (5 Groups)
  // ---------------------------------------------------
  const groups: any[] = [];
  for (let i = 0; i < 5; i++) {
    const group = await prisma.group.create({
      data: {
        name: `${faker.commerce.department()} Workspace`,
      },
    });
    groups.push(group);
  }
  console.log(`✅ Created ${groups.length} Groups.`);

  // ---------------------------------------------------
  // 3. ASSIGN GROUP MEMBERS & INVITES
  // ---------------------------------------------------
  for (const group of groups) {
    // Pick 5 to 10 random users for this group
    const shuffledUsers = faker.helpers.shuffle(users);
    const memberCount = faker.number.int({ min: 5, max: 10 });
    const groupMembers = shuffledUsers.slice(0, memberCount);
    
    for (let i = 0; i < groupMembers.length; i++) {
      const user = groupMembers[i];
      // First user is ADMIN, second is MODERATOR, rest are MEMBER
      const role = i === 0 ? GroupRole.ADMIN : (i === 1 ? GroupRole.MODERATOR : GroupRole.MEMBER);
      
      await prisma.groupMember.create({
        data: {
          userId: user.id,
          groupId: group.id,
          role: role,
          canCreateSchedule: role === GroupRole.ADMIN || role === GroupRole.MODERATOR,
        },
      });
    }

    // Create a couple of pending invites for users NOT in the group
    const nonMembers = shuffledUsers.slice(memberCount, memberCount + 2);
    for (const invitee of nonMembers) {
      await prisma.groupInvite.create({
        data: {
          groupId: group.id,
          inviterId: groupMembers[0].id, // Admin sends the invite
          inviteeId: invitee.id,
          status: GroupInviteStatus.PENDING,
        }
      });
    }
  }
  console.log(`✅ Assigned Group Memberships and Invites.`);

  // ---------------------------------------------------
  // 4. CREATE FRIENDSHIPS & REQUESTS
  // ---------------------------------------------------
  for (let i = 0; i < users.length - 1; i++) {
    const userA = users[i];
    const userB = users[i + 1];

    // Create an accepted friendship
    await prisma.userFriend.create({
      data: { userId: userA.id, friendId: userB.id },
    });

    // Create a pending friend request (from userA to userA+2)
    if (i + 2 < users.length) {
      await prisma.friendRequest.create({
        data: {
          senderId: userA.id,
          receiverId: users[i + 2].id,
          status: FriendRequestStatus.PENDING,
        }
      });
    }
  }
  console.log(`✅ Created Friendships and Pending Requests.`);

  // ---------------------------------------------------
  // 5. CREATE SCHEDULES & TASKS
  // ---------------------------------------------------
  const taskStatuses = ['TODO', 'IN_PROGRESS', 'DONE', 'EXPIRED'];
  const scheduleTypes = ['EVENT', 'MEETING', 'TASK_REMINDER'];
  const colors = ['purple', 'blue', 'green', 'orange', 'red'];

  // Assign schedules and tasks to the first 20 users
  for (const user of users.slice(0, 20)) { 
    const schedule = await prisma.schedule.create({
      data: {
        title: `${faker.company.catchPhrase()} Session`,
        description: faker.lorem.paragraph(),
        startTime: faker.date.soon({ days: 1 }),
        endTime: faker.date.soon({ days: 2 }),
        type: faker.helpers.arrayElement(scheduleTypes),
        color: faker.helpers.arrayElement(colors),
        importance: faker.helpers.arrayElement(['LOW', 'NORMAL', 'HIGH']),
        progress: faker.number.int({ min: 0, max: 100 }),
        userId: user.id,
      }
    });

    for (let j = 0; j < 3; j++) {
      await prisma.task.create({
        data: {
          title: `${faker.hacker.verb()} the ${faker.hacker.noun()}`,
          startDate: faker.date.recent(),
          deadline: faker.date.soon({ days: 7 }),
          status: faker.helpers.arrayElement(taskStatuses),
          priority: faker.number.int({ min: 1, max: 3 }),
          progress: faker.number.int({ min: 0, max: 100 }),
          userId: user.id,
          scheduleId: j === 0 ? schedule.id : null, 
        }
      });
    }
  }
  console.log(`✅ Created Schedules and Personal Tasks.`);

  // ---------------------------------------------------
  // 6. CREATE MESSAGES (Direct & Group)
  // ---------------------------------------------------
  for (let i = 0; i < 50; i++) {
    const sender = faker.helpers.arrayElement(users);
    const recipient = faker.helpers.arrayElement(users.filter(u => u.id !== sender.id));
    const group = faker.helpers.arrayElement(groups);

    // 50% chance for Direct Message, 50% for Group Message
    if (Math.random() > 0.5) {
      await prisma.message.create({
        data: {
          content: faker.lorem.sentence(),
          senderId: sender.id,
          recipientId: recipient.id,
        }
      });
    } else {
      await prisma.message.create({
        data: {
          content: faker.lorem.sentence(),
          senderId: sender.id,
          groupId: group.id,
        }
      });
    }
  }
  console.log(`✅ Created Chat Messages.`);

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });