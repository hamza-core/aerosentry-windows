using AeroSentry.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace AeroSentry.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Property> Properties => Set<Property>();
    public DbSet<PropertyGuard> PropertyGuards => Set<PropertyGuard>();
    public DbSet<Camera> Cameras => Set<Camera>();
    public DbSet<LaserGrid> LaserGrids => Set<LaserGrid>();
    public DbSet<Wall> Walls => Set<Wall>();
    public DbSet<WallCell> WallCells => Set<WallCell>();
    public DbSet<WallCellSquare> WallCellSquares => Set<WallCellSquare>();
    public DbSet<DetectionEvent> DetectionEvents => Set<DetectionEvent>();
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<AlertAction> AlertActions => Set<AlertAction>();
    public DbSet<AuthorizedPerson> AuthorizedPeople => Set<AuthorizedPerson>();
    public DbSet<PersonPhoto> PersonPhotos => Set<PersonPhoto>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.Property(u => u.Email).HasMaxLength(256);
            entity.HasIndex(u => u.Email).IsUnique();

            // Guard -> owner Admin (self-reference). Restrict: deleting a user never
            // silently deletes the users they own.
            entity.HasOne<User>()
                  .WithMany()
                  .HasForeignKey(u => u.OwnerAdminId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Property>(entity =>
        {
            entity.Property(p => p.Name).HasMaxLength(200);
            entity.Property(p => p.Address).HasMaxLength(300);
            entity.Property(p=>p.Note).HasMaxLength(500).IsRequired(false);

            entity.HasOne(p => p.OwnerAdmin)
                  .WithMany()
                  .HasForeignKey(p => p.OwnerAdminId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Camera>(entity =>
        {
            entity.Property(c => c.Name).HasMaxLength(200);
            entity.Property(c => c.SourceType).HasMaxLength(20);
            entity.Property(c => c.Host).HasMaxLength(255);
            entity.Property(c => c.StreamPath).HasMaxLength(300);
            entity.Property(c => c.Username).HasMaxLength(100);
            entity.Property(c => c.Password).HasMaxLength(200);

            // No two cameras in the same property may share a name.
            entity.HasIndex(c => new { c.PropertyId, c.Name }).IsUnique();

            entity.HasOne(c => c.Property)
                  .WithMany()
                  .HasForeignKey(c => c.PropertyId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LaserGrid>(entity =>
        {
            entity.Property(g => g.Name).HasMaxLength(200);

            // No two laser grids in the same property may share a name.
            entity.HasIndex(g => new { g.PropertyId, g.Name }).IsUnique();

            entity.HasOne(g => g.Property)
                  .WithMany()
                  .HasForeignKey(g => g.PropertyId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Wall>(entity =>
        {
            entity.Property(w => w.Name).HasMaxLength(200);

            // No two walls in the same property may share a name.
            entity.HasIndex(w => new { w.PropertyId, w.Name }).IsUnique();

            entity.HasOne(w => w.Property)
                  .WithMany()
                  .HasForeignKey(w => w.PropertyId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Restrict: a camera or laser grid that a wall uses cannot be deleted by accident.
            // (The services check this first and answer 409.)
            entity.HasOne(w => w.Camera)
                  .WithMany()
                  .HasForeignKey(w => w.CameraId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(w => w.LaserGrid)
                  .WithMany()
                  .HasForeignKey(w => w.LaserGridId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<WallCell>(entity =>
        {
            entity.Property(c => c.Label).HasMaxLength(50);

            // No two cells on the same wall may share a label.
            entity.HasIndex(c => new { c.WallId, c.Label }).IsUnique();

            entity.HasOne(c => c.Wall)
                  .WithMany(w => w.Cells)
                  .HasForeignKey(c => c.WallId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<WallCellSquare>(entity =>
        {
            // A laser square belongs to at most one cell, across all walls of the grid.
            entity.HasIndex(s => new { s.LaserGridId, s.Row, s.Col }).IsUnique();

            // Each position in one cell's route is used once.
            entity.HasIndex(s => new { s.WallCellId, s.Order }).IsUnique();

            entity.HasOne(s => s.WallCell)
                  .WithMany(c => c.Squares)
                  .HasForeignKey(s => s.WallCellId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Restrict: deleting a grid never silently deletes routes (the service answers 409 first).
            entity.HasOne(s => s.LaserGrid)
                  .WithMany()
                  .HasForeignKey(s => s.LaserGridId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<DetectionEvent>(entity =>
        {
            entity.Property(e => e.CellLabel).HasMaxLength(50);
            entity.Property(e => e.MlSessionId).HasMaxLength(50);

            // Events are listed newest first per wall.
            entity.HasIndex(e => new { e.WallId, e.DetectedAtUtc });

            entity.HasOne(e => e.Wall)
                  .WithMany()
                  .HasForeignKey(e => e.WallId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Alert>(entity =>
        {
            // INC-0001, INC-0002, ...: the database numbers alerts itself (IDENTITY), so two
            // alarms at the same moment can never get the same number.
            entity.Property(a => a.Number).ValueGeneratedOnAdd();
            entity.HasIndex(a => a.Number).IsUnique();

            entity.Property(a => a.CellLabel).HasMaxLength(50);
            entity.Property(a => a.Status).HasMaxLength(20);
            entity.Property(a => a.RecognizedPersonName).HasMaxLength(100);
            entity.Property(a => a.RecognizedPersonCategory).HasMaxLength(20);

            // One alert per detection event.
            entity.HasIndex(a => a.DetectionEventId).IsUnique();

            // The alerts log is read newest first, per property.
            entity.HasIndex(a => new { a.PropertyId, a.CreatedAtUtc });

            // An alert goes when its detection event goes (which goes with its wall and property).
            entity.HasOne(a => a.DetectionEvent)
                  .WithMany()
                  .HasForeignKey(a => a.DetectionEventId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Restrict on the other two: SQL Server allows only one cascade path to a table.
            entity.HasOne(a => a.Property)
                  .WithMany()
                  .HasForeignKey(a => a.PropertyId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(a => a.Wall)
                  .WithMany()
                  .HasForeignKey(a => a.WallId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AlertAction>(entity =>
        {
            entity.Property(a => a.Action).HasMaxLength(30);
            entity.Property(a => a.FromStatus).HasMaxLength(20);
            entity.Property(a => a.ToStatus).HasMaxLength(20);
            entity.Property(a => a.ByName).HasMaxLength(100);
            entity.Property(a => a.ByRole).HasMaxLength(20);
            entity.Property(a => a.Note).HasMaxLength(500);

            // An alert's history is read oldest first.
            entity.HasIndex(a => new { a.AlertId, a.AtUtc });

            entity.HasOne(a => a.Alert)
                  .WithMany()
                  .HasForeignKey(a => a.AlertId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuthorizedPerson>(entity =>
        {
            entity.Property(p => p.Name).HasMaxLength(100);
            entity.Property(p => p.Phone).HasMaxLength(30);
            entity.Property(p => p.Category).HasMaxLength(20);
            entity.Property(p => p.Note).HasMaxLength(500);

            entity.HasIndex(p => p.PropertyId);

            entity.HasOne(p => p.Property)
                  .WithMany()
                  .HasForeignKey(p => p.PropertyId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PersonPhoto>(entity =>
        {
            entity.Property(p => p.Angle).HasMaxLength(10);
            entity.Property(p => p.ContentType).HasMaxLength(50);

            // One photo per angle and person.
            entity.HasIndex(p => new { p.PersonId, p.Angle }).IsUnique();

            // Removing a person removes the photos and the face numbers with it.
            entity.HasOne(p => p.Person)
                  .WithMany(p => p.Photos)
                  .HasForeignKey(p => p.PersonId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PropertyGuard>(entity =>
        {
            // Composite primary key: the same guard cannot be assigned to the same property twice.
            entity.HasKey(pg => new { pg.PropertyId, pg.GuardId });

            entity.HasOne(pg => pg.Property)
                  .WithMany(p => p.PropertyGuards)
                  .HasForeignKey(pg => pg.PropertyId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(pg => pg.Guard)
                  .WithMany()
                  .HasForeignKey(pg => pg.GuardId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
